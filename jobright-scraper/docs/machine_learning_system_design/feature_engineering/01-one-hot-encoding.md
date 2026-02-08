# One Hot Encoding

**One Hot Encoding** is a technique used to convert categorical variables into a numerical format that can be provided to machine learning algorithms.

## Concept
It maps a categorical feature to a vector where:
*   The length of the vector is equal to the number of categories.
*   The component corresponding to the category is set to **1**.
*   All other components are set to **0**.

## Example
Consider a feature `color` with values `["red", "green", "blue"]`.

*   "red"   -> `[1, 0, 0]`
*   "green" -> `[0, 1, 0]`
*   "blue"  -> `[0, 0, 1]`

## Common Problems & Best Practices

### High Dimensionality
If a categorical feature has many unique values (high cardinality), OHE results in very sparse and high-dimensional vectors, which can be inefficient and lead to the "curse of dimensionality".

### NLP Issues
In Natural Language Processing, treating words as atomic units with OHE fails to capture semantic similarity (e.g., "cat" and "dog" are as orthogonal as "cat" and "spoon").

### Handling "Other" Categories
For categories with low frequency, it is common practice to group them into a single "Other" or "Unknown" category to reduce dimensionality and handle unseen categories during inference.
*   **Best Practice**: Bucket the tail of the distribution into an `<UNK>` (Unknown) token.

## Usage in Tech Companies
*   **Instacart**: Used for categorical features like department or aisle in recommendation models.
*   **DoorDash**: Modeling restaurant categories or time-of-day features.
