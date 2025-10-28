import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

interface DispatchBody {
  scenario: string
  baseURL: string
  ref?: string
}

export async function POST(request: NextRequest) {
  try {
    const token = process.env.GH_ACTIONS_TOKEN
    if (!token) {
      return NextResponse.json({ error: 'Missing GH_ACTIONS_TOKEN' }, { status: 500 })
    }

    // Determine repo and ref
    const fallbackRepo = 'lanternetwork/LootAura'
    const repository = process.env.GITHUB_REPOSITORY || fallbackRepo
    const [owner, repo] = repository.split('/')
    const defaultRef = process.env.VERCEL_GIT_COMMIT_REF || 'main'

    const body: DispatchBody = await request.json()
    const scenario = body.scenario || 'all'
    const baseURL = body.baseURL
    const ref = body.ref || defaultRef

    if (!baseURL) {
      return NextResponse.json({ error: 'baseURL is required' }, { status: 400 })
    }

    // Dispatch the reusable workflow
    const url = `https://api.github.com/repos/${owner}/${repo}/actions/workflows/load-test.yml/dispatches`
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github+json',
      },
      body: JSON.stringify({
        ref,
        inputs: {
          baseURL,
          scenario
        }
      })
    })

    if (!resp.ok) {
      const text = await resp.text()
      return NextResponse.json({ error: 'Failed to dispatch workflow', status: resp.status, details: text }, { status: 502 })
    }

    // Best-effort link to Actions tab
    const actionsUrl = `https://github.com/${owner}/${repo}/actions/workflows/load-test.yml`
    return NextResponse.json({ success: true, actionsUrl, scenario, baseURL, ref })
  } catch (error) {
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}


