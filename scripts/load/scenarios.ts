import { LoadTestConfig } from './harness'

export interface ScenarioOptions {
  baseURL?: string
  ip?: string
  userToken?: string
}

export function salesBaseline(options: ScenarioOptions = {}): LoadTestConfig {
  const baseURL = options.baseURL || 'http://localhost:3000'
  const ip = options.ip || '192.168.1.100'
  
  // Generate random bbox around Louisville, KY
  const baseLat = 38.2527
  const baseLng = -85.7585
  const offset = 0.01 // ~1km offset
  
  return {
    baseURL,
    concurrency: 5,
    durationSec: 60,
    targetRps: 10,
    headers: {
      'X-Forwarded-For': ip
    },
    method: 'GET',
    url: `/api/sales?bbox=${baseLat + offset},${baseLng + offset},${baseLat - offset},${baseLng - offset}`,
    label: 'sales-baseline'
  }
}

export function salesBurst(options: ScenarioOptions = {}): LoadTestConfig {
  const baseURL = options.baseURL || 'http://localhost:3000'
  const ip = options.ip || '192.168.1.101'
  
  const baseLat = 38.2527
  const baseLng = -85.7585
  const offset = 0.01
  
  return {
    baseURL,
    concurrency: 20,
    durationSec: 45,
    targetRps: 80,
    headers: {
      'X-Forwarded-For': ip
    },
    method: 'GET',
    url: `/api/sales?bbox=${baseLat + offset},${baseLng + offset},${baseLat - offset},${baseLng - offset}`,
    label: 'sales-burst'
  }
}

export function salesSustained(options: ScenarioOptions = {}): LoadTestConfig {
  const baseURL = options.baseURL || 'http://localhost:3000'
  const ip = options.ip || '192.168.1.102'
  
  const baseLat = 38.2527
  const baseLng = -85.7585
  const offset = 0.01
  
  return {
    baseURL,
    concurrency: 10,
    durationSec: 120,
    targetRps: 40,
    headers: {
      'X-Forwarded-For': ip
    },
    method: 'GET',
    url: `/api/sales?bbox=${baseLat + offset},${baseLng + offset},${baseLat - offset},${baseLng - offset}`,
    label: 'sales-sustained'
  }
}

export function geocodingCacheWarmup(options: ScenarioOptions = {}): LoadTestConfig {
  const baseURL = options.baseURL || 'http://localhost:3000'
  const ip = options.ip || '192.168.1.103'
  
  return {
    baseURL,
    concurrency: 2,
    durationSec: 30,
    targetRps: 5,
    headers: {
      'X-Forwarded-For': ip
    },
    method: 'GET',
    url: '/api/geocoding/zip?zip=40204',
    label: 'geo-cache-warmup'
  }
}

export function geocodingAbuse(options: ScenarioOptions = {}): LoadTestConfig {
  const baseURL = options.baseURL || 'http://localhost:3000'
  const ip = options.ip || '192.168.1.104'
  
  return {
    baseURL,
    concurrency: 5,
    durationSec: 30,
    targetRps: 30,
    headers: {
      'X-Forwarded-For': ip
    },
    method: 'GET',
    url: '/api/geocoding/zip?zip=40204',
    label: 'geo-abuse'
  }
}

export function authSignin(options: ScenarioOptions = {}): LoadTestConfig {
  const baseURL = options.baseURL || 'http://localhost:3000'
  const ip = options.ip || '192.168.1.105'
  
  return {
    baseURL,
    concurrency: 5,
    durationSec: 30,
    targetRps: 20,
    headers: {
      'X-Forwarded-For': ip,
      'Content-Type': 'application/json'
    },
    method: 'POST',
    url: '/api/auth/signin',
    body: JSON.stringify({
      email: 'test@example.com',
      password: 'testpassword123'
    }),
    label: 'auth-signin'
  }
}

export function authMagicLink(options: ScenarioOptions = {}): LoadTestConfig {
  const baseURL = options.baseURL || 'http://localhost:3000'
  const ip = options.ip || '192.168.1.106'
  
  return {
    baseURL,
    concurrency: 5,
    durationSec: 30,
    targetRps: 20,
    headers: {
      'X-Forwarded-For': ip,
      'Content-Type': 'application/json'
    },
    method: 'POST',
    url: '/api/auth/magic-link',
    body: JSON.stringify({
      email: 'test@example.com'
    }),
    label: 'auth-magic-link'
  }
}

export function mutationSales(options: ScenarioOptions = {}): LoadTestConfig {
  const baseURL = options.baseURL || 'http://localhost:3000'
  const ip = options.ip || '192.168.1.107'
  
  const headers: Record<string, string> = {
    'X-Forwarded-For': ip,
    'Content-Type': 'application/json'
  }
  
  // Add auth token if provided
  if (options.userToken) {
    headers['Authorization'] = `Bearer ${options.userToken}`
  }
  
  return {
    baseURL,
    concurrency: 2,
    durationSec: 60,
    targetRps: 6,
    headers,
    method: 'POST',
    url: '/api/sales',
    body: JSON.stringify({
      title: 'Test Yard Sale',
      description: 'Load test sale',
      address: '123 Test St',
      city: 'Louisville',
      state: 'KY',
      zip_code: '40204',
      lat: 38.2527,
      lng: -85.7585,
      date_start: '2024-12-01',
      time_start: '09:00',
      date_end: '2024-12-01',
      time_end: '15:00'
    }),
    label: 'mutation-sales'
  }
}

export function multiIPSales(options: ScenarioOptions = {}): LoadTestConfig {
  const baseURL = options.baseURL || 'http://localhost:3000'
  const ip = options.ip || '192.168.1.108'
  
  const baseLat = 38.2527
  const baseLng = -85.7585
  const offset = 0.01
  
  return {
    baseURL,
    concurrency: 10,
    durationSec: 60,
    targetRps: 50,
    headers: {
      'X-Forwarded-For': ip
    },
    method: 'GET',
    url: `/api/sales?bbox=${baseLat + offset},${baseLng + offset},${baseLat - offset},${baseLng - offset}`,
    label: 'multi-ip-sales'
  }
}

export const scenarios = {
  'sales-baseline': salesBaseline,
  'sales-burst': salesBurst,
  'sales-sustained': salesSustained,
  'geo-cache-warmup': geocodingCacheWarmup,
  'geo-abuse': geocodingAbuse,
  'auth-signin': authSignin,
  'auth-magic-link': authMagicLink,
  'mutation-sales': mutationSales,
  'multi-ip-sales': multiIPSales
} as const

export type ScenarioName = keyof typeof scenarios
