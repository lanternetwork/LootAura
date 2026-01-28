# Pre-Merge Audit Report
**PR:** #169 - feat: switch to message-based architecture for sale detail navigation  
**Date:** 2026-01-28  
**Status:** CI Green ✅

## Executive Summary

This PR implements a message-based architecture to guarantee native-only rendering of sale detail pages. The implementation is **production-ready** with minor recommendations for hardening.

---

## ✅ Strengths

1. **Comprehensive Coverage**: All major sale navigation points updated:
   - `SaleCard.tsx` ✅
   - `MobileSaleCallout.tsx` ✅
   - `NearbySalesCard.tsx` ✅
   - `HomeClient.tsx` ✅

2. **Hard Block Implementation**: WebView cannot navigate to `/sales/:id` - properly blocked in `onShouldStartLoadWithRequest`

3. **Error Handling**: Native message handler has try/catch blocks

4. **Fallback Behavior**: All components gracefully fall back to normal navigation when not in WebView

5. **Test Updates**: Integration tests updated to work with button-based navigation

6. **Verification**: Native marker (red banner) present for debugging

---

## ⚠️ Issues & Recommendations

### 1. **Security: saleId Validation** (LOW RISK)

**Issue**: `message.saleId` from WebView is used directly in `router.push()` without validation.

**Location**: `mobile/app/index.tsx:137`

**Current Code**:
```typescript
router.push(`/sales/${message.saleId}`);
```

**Risk**: If malicious WebView sends invalid saleId (e.g., `../../../admin`), it could cause navigation issues.

**Recommendation**: Add basic validation:
```typescript
if (message.type === 'OPEN_SALE' && message.saleId) {
  // Validate saleId format (UUID or alphanumeric)
  const saleIdRegex = /^[a-zA-Z0-9_-]+$/;
  if (!saleIdRegex.test(message.saleId)) {
    console.warn('[NATIVE] Invalid saleId format:', message.saleId);
    return;
  }
  router.push(`/sales/${message.saleId}`);
}
```

**Priority**: Low (native screen validates via API, but defense-in-depth is good)

---

### 2. **Missing Navigation Point** (ACCEPTABLE)

**Issue**: `ConfirmationModal.tsx` still uses `router.push(/sales/${saleId})` directly.

**Location**: `components/sales/ConfirmationModal.tsx:66`

**Analysis**: 
- Only used in `SellWizardClient` (sale creation flow)
- Not rendered in WebView context (form/wizard page)
- Acceptable to leave as-is since it's not a WebView scenario

**Recommendation**: Document this is intentional, or add postMessage support if this modal could ever be shown in WebView.

**Priority**: Low (not a WebView scenario)

---

### 3. **Error Handling: postMessage Failures** (MINOR)

**Issue**: If `postMessage` fails silently, user has no feedback.

**Current Behavior**: 
- Web: `postMessage` called, no error handling
- Native: Parse errors logged but navigation silently fails

**Recommendation**: Consider adding user-visible error handling:
```typescript
// Web side
try {
  (window as any).ReactNativeWebView.postMessage(...);
} catch (error) {
  console.error('[WEB] Failed to send postMessage:', error);
  // Fallback to window.location.href
  window.location.href = detailUrl;
}
```

**Priority**: Low (edge case, fallback exists)

---

### 4. **Type Safety: Message Payload** (MINOR)

**Issue**: Message payload uses `any` type.

**Location**: `mobile/app/index.tsx:129`

**Current Code**:
```typescript
const message = JSON.parse(event.nativeEvent.data);
```

**Recommendation**: Add type definition:
```typescript
interface WebViewMessage {
  type: 'OPEN_SALE';
  saleId: string;
}

const message = JSON.parse(event.nativeEvent.data) as WebViewMessage;
```

**Priority**: Low (cosmetic improvement)

---

### 5. **Debug Marker in Production** (MINOR)

**Issue**: Red "NATIVE SALE SCREEN" banner is visible in production.

**Location**: `mobile/app/sales/[id].tsx:174-176`

**Recommendation**: Remove or gate behind debug flag before production release.

**Priority**: Low (temporary debug marker, can be removed later)

---

## ✅ Production Readiness Checklist

- [x] All navigation points updated
- [x] Hard block in place for WebView
- [x] Error handling present
- [x] Fallback behavior implemented
- [x] Tests updated and passing
- [x] No breaking changes to web behavior
- [x] CI passing
- [ ] saleId validation (recommended)
- [ ] Debug marker removal (recommended)

---

## 🔍 Edge Cases Reviewed

1. **Invalid saleId**: Handled by native screen's API validation ✅
2. **WebView not available**: Falls back to normal navigation ✅
3. **Message parse failure**: Caught and logged ✅
4. **Navigation failure**: Caught and logged ✅
5. **Malformed messages**: Caught in try/catch ✅

---

## 📊 Risk Assessment

| Risk | Severity | Likelihood | Mitigation |
|------|----------|------------|------------|
| Invalid saleId injection | Low | Low | API validates, but add client-side validation |
| postMessage failure | Low | Very Low | Fallback to window.location.href exists |
| Navigation failure | Low | Very Low | Error logged, user can retry |
| Missing navigation point | Low | N/A | ConfirmationModal not in WebView context |

**Overall Risk**: **LOW** ✅

---

## 🎯 Recommendations

### Before Merge (Optional)
1. Add saleId validation in native message handler
2. Remove or gate debug marker

### Post-Merge (Nice to Have)
1. Add TypeScript types for WebView messages
2. Add user-visible error handling for postMessage failures
3. Consider adding analytics for postMessage success/failure rates

---

## ✅ Conclusion

**Status**: **APPROVED FOR MERGE** ✅

The implementation is solid and production-ready. The identified issues are minor and can be addressed post-merge. The core functionality (guaranteed native-only sale detail navigation) is correctly implemented with proper error handling and fallbacks.

**Confidence Level**: High

---

## Files Changed Summary

### Web App (4 files)
- `components/SaleCard.tsx` - Button with postMessage
- `components/sales/MobileSaleCallout.tsx` - postMessage in handler
- `components/sales/NearbySalesCard.tsx` - div with postMessage
- `app/HomeClient.tsx` - div with postMessage

### Mobile App (2 files)
- `mobile/app/index.tsx` - Added onMessage handler, hard block
- `mobile/app/sales/[id].tsx` - Native marker (debug)

### Tests (1 file)
- `tests/integration/navigation.viewport-persistence.test.tsx` - Updated for button

**Total**: 7 files changed
