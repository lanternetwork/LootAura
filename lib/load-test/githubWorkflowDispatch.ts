/**
 * Shared GitHub Actions workflow dispatch for load tests.
 * Server-only: uses GH_ACTIONS_TOKEN from environment.
 */

export interface GithubDispatchBody {
  scenario?: string
  baseURL: string
  ref?: string
}

export type GithubDispatchResult =
  | {
      ok: true
      actionsUrl: string
      scenario: string
      baseURL: string
      ref: string
    }
  | {
      ok: false
      status: number
      error: string
      details?: string
      repo?: string
      refTried?: string[]
    }

export async function dispatchGithubLoadTestWorkflow(
  body: GithubDispatchBody
): Promise<GithubDispatchResult> {
  const token = process.env.GH_ACTIONS_TOKEN
  if (!token) {
    return { ok: false, status: 500, error: 'Missing GH_ACTIONS_TOKEN' }
  }

  const fallbackRepo = 'lanternetwork/LootAura'
  const repository = process.env.GH_WORKFLOW_REPO || process.env.GITHUB_REPOSITORY || fallbackRepo
  const [owner, repo] = repository.split('/')
  const defaultRef = process.env.GH_WORKFLOW_REF || process.env.VERCEL_GIT_COMMIT_REF || 'main'
  const asRefVariants = (branch: string | undefined): string[] => {
    if (!branch) return [] as string[]
    const full = branch.startsWith('refs/') ? branch : `refs/heads/${branch}`
    return [branch, full]
  }
  const fallbackRefs = Array.from(
    new Set([
      ...asRefVariants(defaultRef),
      ...asRefVariants('milestone/auth-security-hardening'),
      ...asRefVariants('main'),
    ])
  )

  const scenario = body.scenario || 'all'
  const baseURL = body.baseURL
  const ref = body.ref || defaultRef

  if (!baseURL) {
    return { ok: false, status: 400, error: 'baseURL is required' }
  }

  const byNameUrl = `https://api.github.com/repos/${owner}/${repo}/actions/workflows/load-test.yml/dispatches`
  const tryDispatch = async (targetUrl: string, targetRef: string) => {
    return await fetch(targetUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'LootAura-Admin-LoadTest-Dispatch',
      },
      body: JSON.stringify({
        ref: targetRef,
        inputs: { baseURL, scenario },
      }),
    })
  }

  let resp = await tryDispatch(byNameUrl, ref)

  if (resp.status === 404) {
    const listUrl = `https://api.github.com/repos/${owner}/${repo}/actions/workflows`
    const listResp = await fetch(listUrl, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'LootAura-Admin-LoadTest-Dispatch',
      },
    })
    if (listResp.ok) {
      const workflows = (await listResp.json()) as {
        workflows?: Array<{ id?: number; path?: string; name?: string }>
      }
      const wf = (workflows.workflows || []).find(
        (w) => w.path?.endsWith('/load-test.yml') || w.name === 'Load Tests'
      )
      if (wf?.id) {
        const idUrl = `https://api.github.com/repos/${owner}/${repo}/actions/workflows/${wf.id}/dispatches`
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
    return {
      ok: false,
      status: 502,
      error: 'Failed to dispatch workflow',
      details: text,
      repo: `${owner}/${repo}`,
      refTried: Array.from(new Set([ref, ...fallbackRefs])),
    }
  }

  const actionsUrl = `https://github.com/${owner}/${repo}/actions/workflows/load-test.yml`
  return { ok: true, actionsUrl, scenario, baseURL, ref }
}
