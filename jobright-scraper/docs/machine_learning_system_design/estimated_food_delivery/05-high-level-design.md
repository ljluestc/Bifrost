# High Level Design: Feature Engineering

The model relies on comprehensive feature engineering across multiple categories.

| Feature Category | Features | Description |
| :--- | :--- | :--- |
| **Order features** | Subtotal, Cuisine | Basic characteristics of the order itself. |
| **Item features** | Price, Type | Information about individual items (e.g., drinks vs. cooked meals). |
| **Order type** | Group, Catering | Indicates complexity (group orders take longer). |
| **Merchant details** | Ratings, Popularity | Merchant metadata. |
| **Store ID** | **Store Embedding** | Dense representation capturing latent store characteristics (e.g., speed efficiency). |
| **Realtime features** | # Orders, # Dashers, Traffic | Live system load and travel/weather conditions. |
| **Time features** | Time of day, Day of week | Temporal context (Rush hour vs. Midnight; Weekend vs. Weekday). |
| **Historical aggregates** | Avg Time (Past X weeks) | Rolling stats for Store/City/Market to capture trends. |
| **Similarity** | Avg Parking Time | Metrics from similar past deliveries (e.g., parking difficulty). |
| **Location** | Lat / Lon | Spatial context to estimate driving distance/time. |
