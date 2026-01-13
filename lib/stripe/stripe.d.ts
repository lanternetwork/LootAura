/**
 * Type declaration stub for stripe module
 * This allows TypeScript to type-check without requiring the package to be installed
 * At runtime, the actual stripe package from node_modules will be used
 */
declare module 'stripe' {
  interface StripeConfig {
    apiVersion: string
  }
  
  class Stripe {
    constructor(secretKey: string, config?: StripeConfig)
  }
  
  export default Stripe
}
