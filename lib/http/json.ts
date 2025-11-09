import { NextResponse } from 'next/server'

export const ok = (data: any = {}) => NextResponse.json({ ok: true, ...data }, { status: 200 })

export const fail = (status: number, code: string, error?: string, details?: any) =>
  NextResponse.json({ ok: false, code, error, details }, { status })

