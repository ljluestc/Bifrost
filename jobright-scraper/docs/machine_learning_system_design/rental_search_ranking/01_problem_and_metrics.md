# Rental Search Ranking: Problem Statement and Metrics

## 1. Problem Statement

The goal is to rank rental listings for a specific query such that the homes **most likely to be booked** appear at the top.

This is formulated as a **Binary Classification** task ("Booked" vs "Not Booked") rather than regression.
*   **Why Classification?** It offers better control over the precision/recall trade-off (balancing false positives vs false negatives) compared to predicting raw booking probability.
*   **Objective**: Train a supervised model on historical user sessions to predict the booking outcome.

## 2. Metrics Design

### Offline Metrics
We use **Normalized Discounted Cumulative Gain (nDCG)**, a standard ranking metric where position matters.
*   **Why nDCG?**
    *   Users rarely scroll deep; top positions are exponentially more valuable.
    *   It accounts for both **relevance** (did they book?) and **position** (was it at the top?).
*   **Formula**:
    $$
    nDCG_p = \frac{DCG_p}{IDCG_p} \quad \text{where} \quad DCG_p = \sum_{i=1}^{p} \frac{rel_i}{\log_2(i+1)}
    $$

### Online Metrics
1.  **Conversion Rate**:
    $$
    \text{Conversion Rate} = \frac{\text{Number of Bookings}}{\text{Number of Search Results}}
    $$
2.  **Revenue Lift**: The actual positive business impact of the improved ranking.

## 3. Requirements

### Training Considerations
*   **Imbalanced Data**: Most views do not result in bookings.
    *   *Solution*: Downsampling negatives, SMOTE, or using Focal Loss/Class Weighting.
*   **Time-Based Splitting**:
    *   Train on sessions *before* a cutoff date.
    *   Validate on sessions *after* that date to mimic production forecasting.

### Inference & Serving
*   **Latency**: **50ms - 100ms** (Search must be snappy).
*   **Cold Start**:
    *   New listings lack history.
    *   *Solution*: Fallback to content-based heuristics (e.g., photo quality, competitive pricing) or hybrid models.
