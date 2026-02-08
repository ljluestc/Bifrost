# Crossed Feature

**Crossed Features** (or Feature Crosses) are synthetic features formed by multiplying (crossing) two or more features. Crossing helps the model learn **nonlinear relationships** between features.

## Concept
A linear model cannot learn that "a specific combination of features is important" unless that combination is explicitly fed as a feature. Crossing enables this.

## Example: Location
Imagine predicting housing prices.
*   Feature A: `Latitude`
*   Feature B: `Longitude`

Using just A and B, a linear model learns independent weights for lat and lon.
By crossing them (e.g., binning lat and lon and then crossing the bins), we create grid cells (like "City Blocks"). The model can then learn that a specific *block* (specific combination of lat bin AND lon bin) has high prices.

## Examples in Industry
*   **Uber**: `Time of Day` x `Location` (Lat/Lon) to predict demand. A high demand area at 9 AM might be low demand at 9 PM.
*   **LinkedIn**: `User Location` x `Job Location` to capture relocation preferences.
*   **Airbnb**: `Guest Origin` x `Destination City` to model travel corridors.

## Best Practices
*   **Cardinality Check**: Crossing two high-cardinality features results in an even higher cardinality feature (Cartesian product). Be mindful of model size.
*   **Regularization**: Use L1/L2 regularization to handle the sparsity created by massive crosses.
