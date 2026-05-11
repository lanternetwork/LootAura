(function (global) {
  const ZIP_LOCALITY_FIXTURE = {
    "46319": [{ city: "Griffith", state: "IN", primary: true }],
    // Ambiguous fixture ZIP for fail-closed coverage.
    "60601": [
      { city: "Chicago", state: "IL", primary: false },
      { city: "Near North Side", state: "IL", primary: false },
    ],
  };

  function normalizeZip5(input) {
    if (input == null) return null;
    const m = String(input).trim().match(/^(\d{5})(?:-\d{4})?$/);
    return m ? m[1] : null;
  }

  function normalizeExpectedState(input) {
    if (input == null) return undefined;
    const s = String(input).trim().toUpperCase();
    return /^[A-Z]{2}$/.test(s) ? s : undefined;
  }

  function resolveZipLocalityAuthorityWithDiagnostics(input) {
    const zip5 = normalizeZip5(input && input.zip);
    const expectedState = normalizeExpectedState(input && input.expectedState);
    if (!zip5) {
      return {
        zip: null,
        expectedState: expectedState || null,
        result: null,
        rejectionReason: "invalid_zip",
      };
    }

    const all = ZIP_LOCALITY_FIXTURE[zip5];
    if (!Array.isArray(all) || all.length === 0) {
      return {
        zip: zip5,
        expectedState: expectedState || null,
        result: null,
        rejectionReason: "unknown_zip",
      };
    }

    const stateScoped = expectedState
      ? all.filter(function (row) {
          return String(row.state || "").toUpperCase() === expectedState;
        })
      : all.slice();

    if (expectedState && stateScoped.length === 0) {
      return {
        zip: zip5,
        expectedState,
        result: null,
        rejectionReason: "state_mismatch",
      };
    }

    const primary = stateScoped.filter(function (row) {
      return Boolean(row && row.primary === true);
    });
    if (primary.length !== 1) {
      return {
        zip: zip5,
        expectedState: expectedState || null,
        result: null,
        rejectionReason: "ambiguous_zip_locality",
      };
    }

    return {
      zip: zip5,
      expectedState: expectedState || null,
      result: {
        city: String(primary[0].city || "").trim(),
        state: String(primary[0].state || "").toUpperCase(),
        source: "zip_locality_authority",
        confidence: "primary_zip_match",
      },
      rejectionReason: null,
    };
  }

  function resolveZipLocalityAuthority(input) {
    return resolveZipLocalityAuthorityWithDiagnostics(input).result;
  }

  global.LootAuraZipLocalityResolver = {
    resolveZipLocalityAuthority,
    resolveZipLocalityAuthorityWithDiagnostics,
  };
})(typeof globalThis !== "undefined" ? globalThis : window);
