import { PipelineStep, PropertyInput, StepResult, SaleRecord, PropertyImage } from '../types';
import { APIError, ParseError } from '../../utils/errors';

/**
 * Step 2: Enhanced Rightmove + Land Registry Integration
 * 
 * This step implements the complete flow:
 * 1. Extract property data and sales history from Rightmove
 * 2. Search UK Land Registry using corrected SPARQL queries
 * 3. Return verified full address with high confidence
 * 4. Fallback to constructed address if Land Registry search fails
 */
export class Step2RightmoveLandRegistry implements PipelineStep {
  name = 'Rightmove + Land Registry';
  private sparqlEndpoint = 'https://landregistry.data.gov.uk/landregistry/query';

  async execute(input: PropertyInput): Promise<StepResult> {
    const startTime = Date.now();
    
    try {
      console.log(`[Step2RightmoveLandRegistry] Processing property ${input.propertyId}`);
      
      // Step 1: Extract from Rightmove
      const rightmoveData = await this.extractFromRightmove(input.propertyId);
      
      if (!rightmoveData.success) {
        return {
          success: false,
          confidence: 0,
          error: `Rightmove extraction failed: ${rightmoveData.error}`,
          metadata: { 
            responseTime: Date.now() - startTime,
            source: 'rightmove_failed'
          }
        };
      }

      // Step 2: Search Land Registry if we have sales history
      if (rightmoveData.sales && rightmoveData.sales.length > 0) {
        console.log(`[Step2RightmoveLandRegistry] Found ${rightmoveData.sales.length} sales, searching Land Registry...`);
        
        const landRegistryResult = await this.searchLandRegistry(rightmoveData);
        
        if (landRegistryResult.success && landRegistryResult.fullAddress) {
          return {
            success: true,
            address: landRegistryResult.fullAddress,
            confidence: 0.9, // High confidence for Land Registry verified addresses
            images: rightmoveData.images || [],
            metadata: {
              responseTime: Date.now() - startTime,
              source: 'land_registry_verified',
              strategy: landRegistryResult.strategy,
              verifiedData: landRegistryResult.verifiedData,
              imagesExtracted: rightmoveData.images?.length || 0,
              galleryInteracted: rightmoveData.images?.some((img: PropertyImage) => img.type === 'gallery') || false,
              rightmoveData: {
                postcode: rightmoveData.postcode,
                salesCount: rightmoveData.sales.length
              }
            }
          };
        }
      }

      // Step 3: Fallback to constructed address from Rightmove
      if (rightmoveData.postcode) {
        const fallbackAddress = `Property ${input.propertyId}, ${rightmoveData.postcode}`;
        console.log(`[Step2RightmoveLandRegistry] Land Registry search failed, using fallback: ${fallbackAddress}`);
        
        return {
          success: true,
          address: fallbackAddress,
          confidence: 0.3, // Low confidence for constructed addresses
          images: rightmoveData.images || [],
          metadata: {
            responseTime: Date.now() - startTime,
            source: 'rightmove_fallback',
            imagesExtracted: rightmoveData.images?.length || 0,
            galleryInteracted: rightmoveData.images?.some((img: PropertyImage) => img.type === 'gallery') || false,
            rightmoveData: {
              postcode: rightmoveData.postcode,
              salesCount: rightmoveData.sales?.length || 0
            },
            landRegistryAttempted: rightmoveData.sales && rightmoveData.sales.length > 0
          }
        };
      }

      // Complete failure
      return {
        success: false,
        confidence: 0,
        error: 'No address data found from Rightmove or Land Registry',
        metadata: {
          responseTime: Date.now() - startTime,
          source: 'complete_failure'
        }
      };
      
    } catch (error: any) {
      const responseTime = Date.now() - startTime;
      console.error(`[Step2RightmoveLandRegistry] Error after ${responseTime}ms:`, error.message);
      
      return {
        success: false,
        confidence: 0,
        error: error.message,
        metadata: {
          responseTime,
          errorType: error.constructor.name,
          source: 'error'
        }
      };
    }
  }

  /**
   * Extract property data from Rightmove using Playwright
   */
  private async extractFromRightmove(propertyId: string): Promise<any> {
    // Import playwright dynamically to avoid issues if not installed
    let chromium: any;
    try {
      chromium = (await import('playwright')).chromium;
    } catch (error) {
      return {
        success: false,
        error: 'Playwright not available - required for Rightmove extraction'
      };
    }

    const url = `https://www.rightmove.co.uk/properties/${propertyId}?channel=RES_BUY`;
    let browser = null;
    
    try {
      console.log(`[Step2RightmoveLandRegistry] Extracting from: ${url}`);
      browser = await chromium.launch({ headless: true });
      
      const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
      });
      const page = await context.newPage();
      
      await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
      
      // Handle cookie consent
      try {
        await page.waitForSelector('#onetrust-reject-all-handler', { timeout: 3000 });
        await page.click('#onetrust-reject-all-handler');
        await page.waitForTimeout(1000);
      } catch (e) {
        // No cookie dialog
      }
      
      // Extract postcode
      const postcodeMatch = await page.evaluate(() => {
        const scriptTags = Array.from(document.querySelectorAll('script'));
        for (const script of scriptTags) {
          const element = script as HTMLElement;
          const text = element.textContent || '';
          const match = text.match(/"nearbySoldPropertiesUrl":"[^"]*\/([a-z0-9-]+)\.html"/);
          if (match) return match[1];
        }
        return null;
      });
      
      let postcode = null;
      if (postcodeMatch) {
        postcode = postcodeMatch.replace('-', ' ').toUpperCase();
      }
      
      // Scroll and wait for content
      await page.waitForTimeout(2000);
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(2000);
      
      // Look for sale history
      const saleHistoryExists = await page.locator('text=Property sale history').count() > 0;
      let sales: any[] = [];
      
      if (saleHistoryExists) {
        try {
          await page.locator('text=Property sale history').first().click({ force: true, timeout: 3000 });
          await page.waitForTimeout(1000);
        } catch (e) {
          // Continue anyway
        }
        
        // Extract sale data
        sales = await page.evaluate(() => {
          const salesData: any[] = [];
          const bodyText = document.body.innerText || '';
          
          const historyIndex = bodyText.indexOf('Property sale history');
          if (historyIndex > -1) {
            const historySection = bodyText.substring(historyIndex);
            const lines = historySection.split('\n');
            
            let foundTable = false;
            for (let i = 0; i < lines.length && i < 20; i++) {
              const line = lines[i].trim();
              
              if (line.includes('Year sold') || line.includes('Sold price') || line === '') {
                foundTable = true;
                continue;
              }
              
              if (foundTable) {
                // Look for year pattern
                const yearMatch = line.match(/^(20[0-3][0-9])$/);
                if (yearMatch && i + 1 < lines.length) {
                  const nextLine = lines[i + 1].trim();
                  const priceMatch = nextLine.match(/^£([\d,]+)$/);
                  if (priceMatch) {
                    const year = parseInt(yearMatch[1]);
                    const priceStr = priceMatch[1];
                    const rawPrice = parseInt(priceStr.replace(/,/g, ''));
                    
                    if (rawPrice >= 100000) {
                      salesData.push({
                        year,
                        price: `£${priceStr}`,
                        rawPrice
                      });
                    }
                  }
                }
                
                // Alternative: year and price on same line
                const samLineMatch = line.match(/(20[0-3][0-9])\s+£([\d,]+)/);
                if (samLineMatch) {
                  const year = parseInt(samLineMatch[1]);
                  const priceStr = samLineMatch[2];
                  const rawPrice = parseInt(priceStr.replace(/,/g, ''));
                  
                  if (rawPrice >= 100000) {
                    salesData.push({
                      year,
                      price: `£${priceStr}`,
                      rawPrice
                    });
                  }
                }
              }
              
              if (foundTable && line.includes('Source acknowledgement')) {
                break;
              }
            }
          }
          
          // Remove duplicates and sort
          const uniqueSales: any[] = [];
          const seen = new Set();
          salesData.forEach(sale => {
            const key = `${sale.year}-${sale.rawPrice}`;
            if (!seen.has(key)) {
              seen.add(key);
              uniqueSales.push(sale);
            }
          });
          
          return uniqueSales.sort((a, b) => b.year - a.year);
        });
      }
      
      // Extract all images from the page
      console.log(`[Step2RightmoveLandRegistry] Extracting images for property ${propertyId}`);
      const images = await this.extractPropertyImages(page);
      console.log(`[Step2RightmoveLandRegistry] Found ${images.length} images`);
      
      await context.close();
      
      return {
        success: true,
        propertyId,
        postcode,
        sales,
        images,
        url
      };
      
    } catch (error: any) {
      console.error(`[Step2RightmoveLandRegistry] Rightmove extraction error:`, error.message);
      return {
        success: false,
        error: error.message
      };
    } finally {
      if (browser) {
        await browser.close();
      }
    }
  }

  /**
   * Extract all property images from the Rightmove page
   */
  private async extractPropertyImages(page: any): Promise<PropertyImage[]> {
    const images: PropertyImage[] = [];
    
    try {
      // First, extract images that are already visible on the page
      const visibleImages = await page.evaluate(() => {
        const imageData: Array<{url: string, type: string, caption?: string}> = [];
        
        // Main property image
        const mainImg = document.querySelector('img[data-testid="gallery-main-image"]') || 
                       document.querySelector('.gallery-image img') ||
                       document.querySelector('[data-test="gallery-main-image"] img');
        if (mainImg) {
          const src = mainImg.getAttribute('src') || mainImg.getAttribute('data-src');
          if (src && src.includes('rightmove')) {
            imageData.push({
              url: src,
              type: 'main',
              caption: mainImg.getAttribute('alt') || 'Main property image'
            });
          }
        }
        
        // Gallery thumbnail images
        const thumbnails = document.querySelectorAll('img[data-testid="gallery-thumbnail"]') ||
                          document.querySelectorAll('.gallery-thumbnails img') ||
                          document.querySelectorAll('[data-test="gallery-thumbnail"] img');
        thumbnails.forEach((img: any, index: number) => {
          const src = img.getAttribute('src') || img.getAttribute('data-src');
          if (src && src.includes('rightmove')) {
            imageData.push({
              url: src,
              type: 'gallery',
              caption: img.getAttribute('alt') || `Gallery image ${index + 1}`
            });
          }
        });
        
        // Look for floorplan images
        const floorplans = document.querySelectorAll('img[alt*="floorplan" i], img[src*="floorplan" i]');
        floorplans.forEach((img: any) => {
          const src = img.getAttribute('src') || img.getAttribute('data-src');
          if (src) {
            imageData.push({
              url: src,
              type: 'floorplan',
              caption: 'Property floorplan'
            });
          }
        });
        
        // Look for street view images
        const streetViews = document.querySelectorAll('img[alt*="street" i], img[src*="street" i]');
        streetViews.forEach((img: any) => {
          const src = img.getAttribute('src') || img.getAttribute('data-src');
          if (src) {
            imageData.push({
              url: src,
              type: 'streetview',
              caption: 'Street view'
            });
          }
        });
        
        // Generic property images (fallback)
        const allImages = document.querySelectorAll('img');
        allImages.forEach((img: any, index: number) => {
          const src = img.getAttribute('src') || img.getAttribute('data-src');
          if (src && src.includes('rightmove') && 
              !imageData.some(existing => existing.url === src)) {
            imageData.push({
              url: src,
              type: 'other',
              caption: `Property image ${index + 1}`
            });
          }
        });
        
        return imageData;
      });
      
      // Add visible images to results
      visibleImages.forEach((imgData: any, index: number) => {
        images.push({
          url: imgData.url,
          type: imgData.type as PropertyImage['type'],
          caption: imgData.caption,
          order: index
        });
      });
      
      // Try to interact with gallery to load more images
      let galleryInteracted = false;
      try {
        // Look for gallery button or gallery container
        const galleryButton = page.locator('[data-testid="gallery-launch-button"]').first() ||
                             page.locator('.gallery-launch').first() ||
                             page.locator('button:has-text("View all photos")').first() ||
                             page.locator('button:has-text("Gallery")').first();
                             
        const galleryButtonCount = await galleryButton.count();
        if (galleryButtonCount > 0) {
          console.log(`[Step2RightmoveLandRegistry] Found gallery button, clicking to load more images`);
          await galleryButton.click({ timeout: 3000 });
          await page.waitForTimeout(2000); // Wait for gallery to load
          galleryInteracted = true;
          
          // Extract images from gallery modal/overlay
          const galleryImages = await page.evaluate(() => {
            const galleryData: Array<{url: string, caption?: string}> = [];
            
            // Look for gallery modal images
            const modalImages = document.querySelectorAll('.gallery-modal img, .image-gallery img, .photo-gallery img');
            modalImages.forEach((img: any, index: number) => {
              const src = img.getAttribute('src') || img.getAttribute('data-src');
              if (src && src.includes('rightmove')) {
                galleryData.push({
                  url: src,
                  caption: img.getAttribute('alt') || `Gallery image ${index + 1}`
                });
              }
            });
            
            return galleryData;
          });
          
          // Add gallery images that aren't already in our list
          galleryImages.forEach((imgData: any, index: number) => {
            if (!images.some(existing => existing.url === imgData.url)) {
              images.push({
                url: imgData.url,
                type: 'gallery',
                caption: imgData.caption,
                order: images.length + index
              });
            }
          });
          
          // Close gallery modal if it's blocking
          try {
            const closeButton = page.locator('.gallery-close, .modal-close, [aria-label="Close"]').first();
            const closeButtonCount = await closeButton.count();
            if (closeButtonCount > 0) {
              await closeButton.click({ timeout: 1000 });
            }
          } catch (e) {
            // Ignore close button errors
          }
        }
      } catch (e: any) {
        console.log(`[Step2RightmoveLandRegistry] Could not interact with gallery: ${e.message}`);
      }
      
      // Clean up and deduplicate images
      const cleanedImages = images
        .filter(img => img.url && img.url.length > 0)
        .filter((img, index, self) => 
          index === self.findIndex(other => other.url === img.url)
        )
        .map((img, index) => ({
          ...img,
          order: index,
          // Convert relative URLs to absolute
          url: img.url.startsWith('http') ? img.url : `https://media.rightmove.co.uk${img.url}`
        }));
      
      console.log(`[Step2RightmoveLandRegistry] Image extraction complete: ${cleanedImages.length} images found (gallery interacted: ${galleryInteracted})`);
      
      return cleanedImages;
      
    } catch (error: any) {
      console.error(`[Step2RightmoveLandRegistry] Image extraction error:`, error.message);
      return [];
    }
  }

  /**
   * Search Land Registry using corrected SPARQL queries
   */
  private async searchLandRegistry(rightmoveData: any): Promise<any> {
    if (!rightmoveData.sales || rightmoveData.sales.length === 0) {
      return { success: false, error: 'No sales data for Land Registry search' };
    }

    for (const sale of rightmoveData.sales) {
      console.log(`[Step2RightmoveLandRegistry] Searching Land Registry for ${sale.year} sale of ${sale.price}`);
      
      // Strategy 1: Exact price search
      const exactResult = await this.searchByExactPrice(sale);
      if (exactResult.success && exactResult.results.length > 0) {
        const propertyDetails = this.extractPropertyDetails(exactResult.results[0]);
        return {
          success: true,
          fullAddress: propertyDetails.fullAddress,
          strategy: 'exact-price',
          verifiedData: propertyDetails
        };
      }
      
      // Strategy 2: Date + price range search
      const dateResult = await this.searchByDateRange(sale);
      if (dateResult.success && dateResult.results.length > 0) {
        const propertyDetails = this.extractPropertyDetails(dateResult.results[0]);
        return {
          success: true,
          fullAddress: propertyDetails.fullAddress,
          strategy: 'date-range',
          verifiedData: propertyDetails
        };
      }
      
      // Strategy 3: Postcode + year search
      if (rightmoveData.postcode) {
        const postcodeResult = await this.searchByPostcodeYear(rightmoveData.postcode, sale);
        if (postcodeResult.success && postcodeResult.results.length > 0) {
          const propertyDetails = this.extractPropertyDetails(postcodeResult.results[0]);
          return {
            success: true,
            fullAddress: propertyDetails.fullAddress,
            strategy: 'postcode-year',
            verifiedData: propertyDetails
          };
        }
      }
    }
    
    return { success: false, error: 'No Land Registry matches found' };
  }

  /**
   * Execute SPARQL query with error handling
   */
  private async executeSparqlQuery(sparql: string): Promise<any> {
    try {
      // Import https dynamically to avoid Node.js version issues
      const https = await import('https');
      
      return new Promise((resolve, reject) => {
        const data = JSON.stringify(sparql);
        
        const options = {
          hostname: 'landregistry.data.gov.uk',
          path: '/landregistry/query',
          method: 'POST',
          headers: {
            'Content-Type': 'application/sparql-query',
            'Accept': 'application/json',
            'User-Agent': 'AddressResolver-Pipeline/1.0',
            'Content-Length': Buffer.byteLength(data)
          },
          timeout: 15000
        };
        
        const req = https.request(options, (res) => {
          let body = '';
          
          res.on('data', (chunk) => {
            body += chunk;
          });
          
          res.on('end', () => {
            try {
              const json = JSON.parse(body);
              if (json.results && json.results.bindings) {
                resolve({
                  success: true,
                  results: json.results.bindings
                });
              } else {
                resolve({ success: false, error: 'No results found' });
              }
            } catch (error) {
              resolve({ success: false, error: 'Invalid JSON response' });
            }
          });
        });
        
        req.on('error', (error) => {
          resolve({ success: false, error: error.message });
        });
        
        req.on('timeout', () => {
          req.abort();
          resolve({ success: false, error: 'Request timeout' });
        });
        
        req.write(data);
        req.end();
      });
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Search by exact price
   */
  private async searchByExactPrice(sale: any) {
    const sparql = `
PREFIX lrcommon: <http://landregistry.data.gov.uk/def/common/>
PREFIX lrppi: <http://landregistry.data.gov.uk/def/ppi/>
SELECT ?transx ?pricePaid ?date ?paon ?street ?postcode ?propType ?estateType ?newBuild
WHERE {
  ?transx lrppi:pricePaid ?pricePaid ;
           lrppi:transactionDate ?date ;
           lrppi:propertyAddress ?addr .
  ?addr lrcommon:paon ?paon ;
        lrcommon:street ?street ;
        lrcommon:postcode ?postcode .
  OPTIONAL { ?transx lrppi:propertyType ?propType }
  OPTIONAL { ?transx lrppi:estateType ?estateType }
  OPTIONAL { ?transx lrppi:newBuild ?newBuild }
  FILTER(?pricePaid = ${sale.rawPrice})
}
LIMIT 10`;

    return await this.executeSparqlQuery(sparql);
  }

  /**
   * Search by date range
   */
  private async searchByDateRange(sale: any) {
    const sparql = `
PREFIX lrcommon: <http://landregistry.data.gov.uk/def/common/>
PREFIX lrppi: <http://landregistry.data.gov.uk/def/ppi/>
SELECT ?transx ?pricePaid ?date ?paon ?street ?postcode ?propType ?estateType ?newBuild
WHERE {
  ?transx lrppi:pricePaid ?pricePaid ;
           lrppi:transactionDate ?date ;
           lrppi:propertyAddress ?addr .
  ?addr lrcommon:paon ?paon ;
        lrcommon:street ?street ;
        lrcommon:postcode ?postcode .
  OPTIONAL { ?transx lrppi:propertyType ?propType }
  OPTIONAL { ?transx lrppi:estateType ?estateType }
  OPTIONAL { ?transx lrppi:newBuild ?newBuild }
  FILTER(YEAR(?date) = ${sale.year})
  FILTER(?pricePaid >= ${Math.floor(sale.rawPrice * 0.95)})
  FILTER(?pricePaid <= ${Math.ceil(sale.rawPrice * 1.05)})
}
LIMIT 10`;

    return await this.executeSparqlQuery(sparql);
  }

  /**
   * Search by postcode and year
   */
  private async searchByPostcodeYear(postcode: string, sale: any) {
    const sparql = `
PREFIX lrcommon: <http://landregistry.data.gov.uk/def/common/>
PREFIX lrppi: <http://landregistry.data.gov.uk/def/ppi/>
SELECT ?transx ?pricePaid ?date ?paon ?street ?postcode ?propType ?estateType ?newBuild
WHERE {
  ?transx lrppi:pricePaid ?pricePaid ;
           lrppi:transactionDate ?date ;
           lrppi:propertyAddress ?addr .
  ?addr lrcommon:paon ?paon ;
        lrcommon:street ?street ;
        lrcommon:postcode ?postcode .
  OPTIONAL { ?transx lrppi:propertyType ?propType }
  OPTIONAL { ?transx lrppi:estateType ?estateType }
  OPTIONAL { ?transx lrppi:newBuild ?newBuild }
  FILTER(?postcode = "${postcode}")
  FILTER(YEAR(?date) = ${sale.year})
}
LIMIT 20`;

    return await this.executeSparqlQuery(sparql);
  }

  /**
   * Extract property details from Land Registry result
   */
  private extractPropertyDetails(landRegistryItem: any): any {
    const getValue = (key: string) => {
      if (landRegistryItem[key]) {
        return typeof landRegistryItem[key] === 'object' && landRegistryItem[key].value 
          ? landRegistryItem[key].value 
          : landRegistryItem[key];
      }
      return null;
    };
    
    const getUriValue = (key: string) => {
      const value = getValue(key);
      if (value && value.includes('#')) {
        return value.split('#').pop();
      }
      if (value && value.includes('/')) {
        return value.split('/').pop();
      }
      return value;
    };
    
    const addressParts = [];
    
    const paon = getValue('paon');
    const street = getValue('street');
    const postcode = getValue('postcode');
    
    if (paon) addressParts.push(paon);
    if (street) {
      // Capitalize street names properly
      const formattedStreet = street.toLowerCase()
        .split(' ')
        .map((word: string) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
      addressParts.push(formattedStreet);
    }
    
    // Add London for London postcodes
    const isLondonPostcode = postcode && (postcode.startsWith('SW') || postcode.startsWith('W') || 
                                        postcode.startsWith('E') || postcode.startsWith('N') || 
                                        postcode.startsWith('S') || postcode.startsWith('NW') || 
                                        postcode.startsWith('SE'));
    if (isLondonPostcode) {
      addressParts.push('London');
    }
    
    if (postcode) addressParts.push(postcode);
    
    return {
      transactionId: getValue('transx')?.split('/').pop() || 'Unknown',
      fullAddress: addressParts.filter((part: any) => part && part.trim()).join(', '),
      pricePaid: parseInt(getValue('pricePaid')) || 0,
      formattedPrice: `£${(parseInt(getValue('pricePaid')) || 0).toLocaleString()}`,
      date: getValue('date'),
      propertyType: getUriValue('propType') || 'unknown',
      estateType: getUriValue('estateType') || 'unknown',
      newBuild: getValue('newBuild') === 'true'
    };
  }
}