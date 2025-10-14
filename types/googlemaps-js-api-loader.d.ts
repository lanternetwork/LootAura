declare module '@googlemaps/js-api-loader' {
  export interface LoaderOptions {
    apiKey: string
    libraries?: string[]
    id?: string
    version?: string
  }

  export class Loader {
    constructor(options: LoaderOptions)
    load(): Promise<typeof google>
  }
}


