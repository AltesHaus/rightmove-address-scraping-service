-- Select 50 properties with their ID, outcode, and incode for API testing
-- This query ensures we get properties with valid postcodes for testing

SELECT 
    id::integer as id,
    outcode,
    incode
FROM rightmove_properties_v2 
WHERE 
    outcode IS NOT NULL 
    AND outcode != ''
    AND incode IS NOT NULL 
    AND incode != ''
ORDER BY RANDOM()
LIMIT 50;

-- Alternative query if you want a mix of properties (some with only outcode)
-- SELECT 
--     id::integer as id,
--     outcode,
--     incode
-- FROM rightmove_properties_v2 
-- WHERE 
--     outcode IS NOT NULL 
--     AND outcode != ''
-- ORDER BY RANDOM()
-- LIMIT 50;

-- Query to check data distribution before testing
-- SELECT 
--     COUNT(*) as total_properties,
--     COUNT(CASE WHEN outcode IS NOT NULL AND outcode != '' THEN 1 END) as has_outcode,
--     COUNT(CASE WHEN incode IS NOT NULL AND incode != '' THEN 1 END) as has_incode,
--     COUNT(CASE WHEN outcode IS NOT NULL AND outcode != '' AND incode IS NOT NULL AND incode != '' THEN 1 END) as has_both
-- FROM rightmove_properties_v2;