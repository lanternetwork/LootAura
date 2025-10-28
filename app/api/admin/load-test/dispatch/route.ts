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
    const fallbackRefs = [
      defaultRef,
      'milestone/auth-security-hardening',
      'main'
    ].filter((v, i, a) => !!v && a.indexOf(v) === i)

    const body: DispatchBody = await request.json()
    const scenario = body.scenario || 'all'
    const baseURL = body.baseURL
    const ref = body.ref || defaultRef

    if (!baseURL) {
      return NextResponse.json({ error: 'baseURL is required' }, { status: 400 })
    }

    // Dispatch the reusable workflow
    const byNameUrl = `https://api.github.com/repos/${owner}/${repo}/actions/workflows/load-test.yml/dispatches`
    async function tryDispatch(targetUrl: string, targetRef: string) {
      return fetch(targetUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/vnd.github+json',
          'Content-Type': 'application/json',
          'X-GitHub-Api-Version': '2022-11-28',
          'User-Agent': 'LootAura-Admin-LoadTest-Dispatch'
        },
        body: JSON.stringify({
          ref: targetRef,
          inputs: { baseURL, scenario }
        })
      })
    }

    // First attempt: dispatch by filename on provided ref
    let resp = await tryDispatch(byNameUrl, ref)

    // If 404, try resolving workflow ID dynamically and retry
    if (resp.status === 404) {
      const listUrl = `https://api.github.com/repos/${owner}/${repo}/actions/workflows`
      const listResp = await fetch(listUrl, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          'User-Agent': 'LootAura-Admin-LoadTest-Dispatch'
        }
      })
      if (listResp.ok) {
        const workflows = await listResp.json() as any
        const wf = (workflows.workflows || []).find((w: any) => w.path?.endsWith('/load-test.yml') || w.name === 'Load Tests')
        if (wf?.id) {
          const idUrl = `https://api.github.com/repos/${owner}/${repo}/actions/workflows/${wf.id}/dispatches`
          // Try known refs in order
          for (const candidateRef of fallbackRefs) {
            resp = await tryDispatch(idUrl, candidateRef)
            if (resp.ok) {
              break
            }
          }
        }
      }
    }

    if (!resp.ok) {
      const text = await resp.text()
      return NextResponse.json({ error: 'Failed to dispatch workflow', status: resp.status, details: text, repo: `${owner}/${repo}`, refTried: [ref, ...fallbackRefs], workflow: 'load-test.yml' }, { status: 502 })
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


