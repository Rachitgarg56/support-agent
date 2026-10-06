# Asterline Operations (fictional evaluation document)

When a workspace exceeds its hourly API limit, Asterline returns HTTP 429 with a Retry-After header. Clients should wait for the indicated time before retrying.

Failed webhook deliveries are retried up to five times with exponential backoff over 24 hours. A successful delivery ends the retry sequence.

The backup recovery time objective is four hours. The recovery point objective is one hour. These are targets, not guarantees.

Invoices are issued on the first calendar day of each month. Only workspace admins may download invoices.

The public status page reports active incidents. It does not publish private workspace documents or member email addresses.
