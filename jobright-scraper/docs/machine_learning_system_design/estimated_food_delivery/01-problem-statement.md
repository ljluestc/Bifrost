# Problem Statement

The goal is to design an accurate and scalable Machine Learning system to **estimate the total delivery time** for food orders.

## Core Equation
The total delivery time is composed of three distinct segments:

$$
\text{Delivery Time} = \text{Pickup Time} + \text{Point-to-Point Time} + \text{Drop-off Time}
$$

1.  **Pickup Time**: Time for the restaurant to prepare the food and for the dasher to arrive.
2.  **Point-to-Point Time**: Driving time from the restaurant to the customer.
3.  **Drop-off Time**: Time for the dasher to find parking and deliver the food to the customer's door.

## Inputs
To predict this accurately, the model relies on:
*   **Order Details**: Subtotal, cuisine, number of items.
*   **Market Conditions**: Time of day, day of week, weather.
*   **Real-time Traffic**: Current road conditions and dashers availability.
