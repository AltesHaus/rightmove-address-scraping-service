import { PipelineStep, PropertyInput, StepResult, SaleRecord, PropertyImage } from '../types';
import { APIError, ParseError } from '../../utils/errors';

/**
 * Step 2: Enhanced Rightmove + Land Registry Integration
 * 
 * This step implements the complete flow:
 * 1. Extract property data and sales history from Rightmove
 * 2. Search UK Land Registry using corrected SPARQL queries
 * 3. Return verified full address with high confidence
 * 4. Return failure if Land Registry search fails (no fallback addresses)
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
            coordinates: rightmoveData.coordinates,
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

      // Step 3: Return success but with null address if Land Registry search fails
      console.log(`[Step2RightmoveLandRegistry] Land Registry search failed, returning null address`);
      
      return {
        success: true,
        address: undefined,
        confidence: 0,
        images: rightmoveData.images || [],
        coordinates: rightmoveData.coordinates,
        metadata: {
          responseTime: Date.now() - startTime,
          source: 'land_registry_failed',
          imagesExtracted: rightmoveData.images?.length || 0,
          galleryInteracted: rightmoveData.images?.some((img: PropertyImage) => img.type === 'gallery') || false,
          rightmoveData: {
            postcode: rightmoveData.postcode,
            salesCount: rightmoveData.sales?.length || 0
          },
          landRegistryAttempted: rightmoveData.sales && rightmoveData.sales.length > 0
        }
      };

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
      
      // Handle cookie consent - improved handling
      try {
        // Try reject first (original approach)
        const rejectButton = page.locator('#onetrust-reject-all-handler');
        if (await rejectButton.count() > 0) {
          console.log('[Step2RightmoveLandRegistry] Rejecting cookies...');
          await rejectButton.click({ timeout: 3000 });
          await page.waitForTimeout(1000);
        } else {
          // Fallback to accept if reject not found
          const acceptButton = page.locator('button:has-text("Accept All")').or(page.locator('#onetrust-accept-btn-handler')).or(page.locator('button:has-text("Accept")'));
          if (await acceptButton.count() > 0) {
            console.log('[Step2RightmoveLandRegistry] Accepting cookies...');
            await acceptButton.first().click({ timeout: 3000 });
            await page.waitForTimeout(1000);
          }
        }
      } catch (e: any) {
        console.log('[Step2RightmoveLandRegistry] Cookie consent handling failed:', e.message);
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
      
      // Extract coordinates from JavaScript data
      const coordinates = await page.evaluate(() => {
        try {
          // Check window.adInfo first (most reliable)
          if ((window as any).adInfo?.propertyData?.location) {
            const location = (window as any).adInfo.propertyData.location;
            if (location.latitude && location.longitude) {
              return {
                latitude: location.latitude,
                longitude: location.longitude,
                accuracy: location.pinType || 'UNKNOWN',
                source: 'rightmove'
              };
            }
          }
          
          // Fallback: Check for coordinates in script tags
          const scriptTags = Array.from(document.querySelectorAll('script'));
          for (const script of scriptTags) {
            const text = script.textContent || '';
            
            // Look for latitude/longitude patterns
            const latMatch = text.match(/"latitude":(-?\d+\.\d+)/);
            const lngMatch = text.match(/"longitude":(-?\d+\.\d+)/);
            
            if (latMatch && lngMatch) {
              return {
                latitude: parseFloat(latMatch[1]),
                longitude: parseFloat(lngMatch[1]),
                accuracy: 'APPROXIMATE',
                source: 'rightmove'
              };
            }
          }
          return null;
        } catch (e) {
          console.error('Error extracting coordinates:', e);
          return null;
        }
      });
      
      // Scroll and wait for content
      await page.waitForTimeout(2000);
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(2000);
      
      // Look for sale history - try multiple selectors
      const saleHistoryExists = await page.locator('text=Property sale history').count() > 0;
      let sales: any[] = [];
      
      if (saleHistoryExists) {
        try {
          // Try button selector first (more specific)
          const historyButton = page.locator('button:has-text("Property sale history")');
          if (await historyButton.count() > 0) {
            console.log('[Step2RightmoveLandRegistry] Clicking sales history button...');
            await historyButton.first().click({ timeout: 5000 });
            await page.waitForTimeout(2000); // Wait longer for expansion
            
            // Verify the section expanded by checking aria-expanded or content visibility
            const isExpanded = await historyButton.first().getAttribute('aria-expanded');
            console.log('[Step2RightmoveLandRegistry] Button aria-expanded:', isExpanded);
          } else {
            // Fallback to text selector
            console.log('[Step2RightmoveLandRegistry] Using fallback text selector...');
            await page.locator('text=Property sale history').first().click({ force: true, timeout: 5000 });
            await page.waitForTimeout(2000);
          }
        } catch (e: any) {
          console.log('[Step2RightmoveLandRegistry] Failed to click sales history:', e.message);
          // Continue anyway
        }
        
        // Extract sale data
        sales = await page.evaluate(() => {
          const salesData: any[] = [];
          const bodyText = document.body.innerText || '';
          
          const historyIndex = bodyText.indexOf('Property sale history');
          if (historyIndex > -1) {
            const historySection = bodyText.substring(historyIndex, historyIndex + 2000); // Limit to first 2000 chars for debugging
            const lines = historySection.split('\n');
            
            // Debug: log first few lines to see what we're working with
            console.log('[Sales History Debug] First 15 lines:', lines.slice(0, 15));
            
            let foundTable = false;
            // Increased search range and added more trigger phrases
            for (let i = 0; i < lines.length && i < 50; i++) {
              const line = lines[i].trim();
              
              if (line.includes('Property sale history') || line.includes('Year sold') || line.includes('Sold price') || 
                  line.includes('Listing:') || line.includes('Guide Price')) {
                foundTable = true;
                continue;
              }
              
              if (foundTable) {
                // Look for year pattern (1900s-2039) - exact match
                const yearMatch = line.match(/^(19[0-9][0-9]|20[0-3][0-9])$/);
                if (yearMatch) {
                  // Look for price in the next few lines (skip headers and empty lines)
                  for (let j = i + 1; j < Math.min(i + 4, lines.length); j++) {
                    const nextLine = lines[j].trim();
                    // Skip empty lines, percentage lines, and header remnants
                    if (!nextLine || nextLine.includes('Year sold') || nextLine.includes('Sold price') ||
                        nextLine.match(/^[+\-]\d+%$/)) {
                      continue;
                    }
                    // More flexible price matching (handle potential invisible chars)
                    const priceMatch = nextLine.match(/£([\d,]+)/);
                    if (priceMatch) {
                      const year = parseInt(yearMatch[1]);
                      const priceStr = priceMatch[1];
                      const rawPrice = parseInt(priceStr.replace(/,/g, ''));
                      
                      // Lower threshold for older properties (1990s could be cheaper)
                      if (rawPrice >= 50000) {
                        salesData.push({
                          year,
                          price: `£${priceStr}`,
                          rawPrice
                        });
                        break; // Found price, stop looking
                      }
                    }
                  }
                }
                
                // Alternative: year and price on same line (1900s-2039) - more flexible
                const samLineMatch = line.match(/(19[0-9][0-9]|20[0-3][0-9]).*£([\d,]+)/);
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
        
        console.log(`[Step2RightmoveLandRegistry] Sales extraction completed. Found ${sales.length} sales records.`);
      }
      
      await context.close();
      
      return {
        success: true,
        propertyId,
        postcode,
        sales,
        coordinates,
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
   * Search Land Registry using corrected SPARQL queries
   */
  private async searchLandRegistry(rightmoveData: any): Promise<any> {
    if (!rightmoveData.sales || rightmoveData.sales.length === 0) {
      return { success: false, error: 'No sales data for Land Registry search' };
    }

    for (const sale of rightmoveData.sales) {
      console.log(`[Step2RightmoveLandRegistry] Searching Land Registry for ${sale.year} sale of ${sale.price} in ${rightmoveData.postcode}`);
      
      // Strategy 1: PRECISE search - postcode + year + exact price (ALL THREE must match)
      if (rightmoveData.postcode) {
        const preciseResult = await this.searchByPostcodeYearPrice(rightmoveData.postcode, sale);
              if (preciseResult.success && preciseResult.results.length > 0) {
        const propertyDetails = this.extractPropertyDetails(preciseResult.results[0]);
          return {
            success: true,
            fullAddress: propertyDetails.fullAddress,
            strategy: 'postcode-year-price',
            verifiedData: propertyDetails
          };
        }
      }
      
      // Strategy 2: Postcode + year (fallback if exact price doesn't match)
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
      
      // Strategy 3: Outcode + year + exact price (fallback for postcode mismatches)
      if (rightmoveData.postcode) {
        const outcode = rightmoveData.postcode.split(' ')[0]; // Extract first part (e.g., "SW1W" from "SW1W 8DB")
        console.log(`[Step2RightmoveLandRegistry] Trying outcode fallback: ${outcode}`);
        const outcodeResult = await this.searchByOutcodeYearPrice(outcode, sale);
        if (outcodeResult.success && outcodeResult.results.length > 0) {
          const propertyDetails = this.extractPropertyDetails(outcodeResult.results[0]);
          return {
            success: true,
            fullAddress: propertyDetails.fullAddress,
            strategy: 'outcode-year-price',
            verifiedData: propertyDetails
          };
        }
      }

      // Strategy 4: Outcode + year (wider fallback)
      if (rightmoveData.postcode) {
        const outcode = rightmoveData.postcode.split(' ')[0];
        const outcodeYearResult = await this.searchByOutcodeYear(outcode, sale);
        if (outcodeYearResult.success && outcodeYearResult.results.length > 0) {
          const propertyDetails = this.extractPropertyDetails(outcodeYearResult.results[0]);
          return {
            success: true,
            fullAddress: propertyDetails.fullAddress,
            strategy: 'outcode-year',
            verifiedData: propertyDetails
          };
        }
      }

      // Strategy 5: Date + price range search (wider fallback)
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
        const data = sparql; // Send SPARQL as plain text, not JSON
        
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
   * Search by postcode, year AND exact price (all three must match)
   */
  private async searchByPostcodeYearPrice(postcode: string, sale: any) {
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
  FILTER(?pricePaid = ${sale.rawPrice})
}
LIMIT 10`;

    return await this.executeSparqlQuery(sparql);
  }

  /**
   * Search by outcode (first part of postcode), year AND exact price
   */
  private async searchByOutcodeYearPrice(outcode: string, sale: any) {
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
  FILTER(STRSTARTS(?postcode, "${outcode}"))
  FILTER(YEAR(?date) = ${sale.year})
  FILTER(?pricePaid = ${sale.rawPrice})
}
LIMIT 10`;

    return await this.executeSparqlQuery(sparql);
  }

  /**
   * Search by outcode (first part of postcode) and year only
   */
  private async searchByOutcodeYear(outcode: string, sale: any) {
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
  FILTER(STRSTARTS(?postcode, "${outcode}"))
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