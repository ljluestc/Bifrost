# Feature Hashing

**Feature Hashing** (also known as the hashing trick) is a fast and space-efficient way of vectorizing features.

## Concept
Instead of maintaining a one-to-one mapping (like in One Hot Encoding) which requires a dictionary of all unique values, feature hashing uses a hash function to map values directly to indices in a fixed-size vector.

## Example
Consider the input string: "The quick brown fox".
We want a feature vector of length 5.

Using a hypothetical hash function $h(x) \pmod 5$:
*   $h(\text{"The"}) \pmod 5 = 1$
*   $h(\text{"quick"}) \pmod 5 = 3$
*   $h(\text{"brown"}) \pmod 5 = 1$  (Collision!)
*   $h(\text{"fox"}) \pmod 5 = 4$

The resulting vector (using counts) might look like: `[0, 2, 0, 1, 1]`
*Index 1 has a count of 2 because both "The" and "brown" hashed to it.*

## Trade-offs
*   **Pros**:
    *   **Low Memory**: No need to store a giant vocabulary mapping.
    *   **Online Learning**: Can handle new features that weren't seen during training without retraining the dictionary.
*   **Cons**:
    *   **Collisions**: Different features can map to the same index, introducing noise.
    *   **Irreversibility**: You cannot easily go back from the hash index to the original feature.

## Usage in Tech Companies
*   **Booking.com**: Handling high cardinality in user city or hotel ID.
*   **Facebook/Meta**: Used in large-scale ads prediction models where features are sparse and high-dimensional.
*   **Yahoo**: Vowpal Wabbit (VW) library heavily utilizes feature hashing.
