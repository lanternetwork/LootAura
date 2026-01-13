/**
 * Type declaration stub for stripe module
 * This allows TypeScript to type-check without requiring the package to be installed
 * At runtime, the actual stripe package from node_modules will be used
 * 
 * Note: This is a minimal stub. When the stripe package is installed,
 * its own type definitions will take precedence.
 */
declare module 'stripe' {
  interface StripeConfig {
    apiVersion?: string
    [key: string]: any
  }
  
  class Stripe {
    constructor(secretKey: string, config?: StripeConfig)
    [key: string]: any
  }
  
  export = Stripe
  export default Stripe
}
