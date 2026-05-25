/**
 * @deprecated Use `esnetOrchestrationState` (`ESNET_BOOTSTRAP_STATE_KEY`).
 */
export {
  ESNET_BOOTSTRAP_STATE_KEY as COVERAGE_BOOTSTRAP_ESNET_STATE_KEY,
  fetchEsnetBootstrapState as fetchEsnetCoverageBootstrapState,
  fetchEsnetBootstrapEnabled as fetchEsnetCoverageBootstrapEnabled,
  setEsnetBootstrapEnabled as setEsnetCoverageBootstrapEnabled,
} from '@/lib/ingestion/estatesalesnet/esnetOrchestrationState'
