import { PipelineStep, PropertyInput, StepResult } from '../utils/types';
/**
 * Step 2: Simplified Rightmove Check
 *
 * This step now only:
 * 1. Checks if property exists on Rightmove
 * 2. Returns failure since no postcode/coordinates/images are extracted
 *
 * Note: With postcode provided externally, this step could be enhanced
 * to do Land Registry verification, but currently simplified.
 */
export declare class Step2RightmoveLandRegistry implements PipelineStep {
    name: string;
    private sparqlEndpoint;
    execute(input: PropertyInput): Promise<StepResult>;
    /**
     * Extract property data from Rightmove using Playwright
     */
    private extractFromRightmove;
    /**
     * Smart postcode search with outcode+incode fallback strategies
     */
    private smartPostcodeSearch;
    /**
     * Search Land Registry using corrected SPARQL queries with provided postcode
     */
    private searchLandRegistryWithPostcode;
    /**
     * Search Land Registry using only outcode (optimized for performance)
     */
    private searchLandRegistryWithOutcode;
    /**
     * Execute SPARQL query with error handling
     */
    private executeSparqlQuery;
    /**
     * Search by exact price
     */
    private searchByExactPrice;
    /**
     * Search by date range
     */
    private searchByDateRange;
    /**
     * Search by postcode and year
     */
    private searchByPostcodeYear;
    /**
     * Search by postcode, year AND exact price (all three must match)
     */
    private searchByPostcodeYearPrice;
    /**
     * Search by outcode (first part of postcode), year AND exact price
     */
    private searchByOutcodeYearPrice;
    /**
     * Search by outcode (first part of postcode) and year only
     */
    private searchByOutcodeYear;
    /**
     * Extract property details from Land Registry result
     */
    private extractPropertyDetails;
}
//# sourceMappingURL=Step2RightmoveLandRegistry.d.ts.map