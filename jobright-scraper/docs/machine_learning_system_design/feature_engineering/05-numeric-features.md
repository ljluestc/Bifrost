# Numeric Features

For numeric features, preprocessing is often required ensuring that they contribute equally to the model learning process and to handle outliers.

## Techniques

### 1. Normalization (Min-Max Scaling)
Scales the data to a fixed range, typically `[0, 1]`.
$$
x' = \frac{x - \min(x)}{\max(x) - \min(x)}
$$
*   **Use case**: When you know the bounds of your data and want to preserve the distribution shape (e.g., pixel intensities).

### 2. Standardization (Z-Score Normalization)
Rescales the data to have a mean ($\mu$) of 0 and standard deviation ($\sigma$) of 1.
$$
x' = \frac{x - \mu}{\sigma}
$$
*   **Use case**: Most common. Good for algorithms that assume Gaussian distribution (e.g., Logistic Regression, SVMs) and makes optimization (Gradient Descent) converge faster.

### 3. Log Transformation
Applying a logarithm to the feature values.
$$
x' = \log(x + 1)
$$
*   **Use case**: Handling power-law distributions (long tail). Examples: User income, number of comments, video view counts. It compresses the range of large values and spreads out small values.
