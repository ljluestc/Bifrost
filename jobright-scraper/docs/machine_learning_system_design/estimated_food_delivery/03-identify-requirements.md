# Requirements

## Training Data
We utilize historical delivery data from the **last 6 months**.

### Data Schema
The historical dataset includes:
*   **Delivery Data**: Timestamps for all stages (placed, pickup, delivered).
*   **Actual Total Delivery Time**: The ground truth label.
*   **Store Data**: ID, location, cuisine, average prep time.
*   **Order Data**: Items, subtotal, special instructions.
*   **Customer Data**: Location, past delivery history.
*   **Location & Parking**: GPS coordinates, parking difficulty scores.

## Real-time Requirements
*   **Latency**: Predictions must be served in real-time (< 200ms) during checkout.
*   **Freshness**: Features like "Current Traffic" and "Number of Dashers" must be updated near real-time.
