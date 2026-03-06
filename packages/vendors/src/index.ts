/**
 * @yourtm/vendors
 *
 * Type-safe wrappers for common analytics vendors
 *
 * @example
 * ```ts
 * // Import specific vendor
 * import { loadGtag, gtag } from '@yourtm/vendors/google';
 * import { loadFbq, fbq } from '@yourtm/vendors/meta';
 *
 * // Or import everything
 * import * as vendors from '@yourtm/vendors';
 * ```
 */

// ============================================================================
// Google Analytics 4
// ============================================================================

export {
  // Core functions
  loadGtag,
  initGtag,
  gtag,
  // Convenience functions
  configureGA4,
  trackPageView as trackGAPageView,
  trackPurchase as trackGAPurchase,
  trackAddToCart as trackGAAddToCart,
  trackViewItem as trackGAViewItem,
  trackBeginCheckout as trackGABeginCheckout,
  setUserProperties as setGAUserProperties,
  setUserId as setGAUserId,
  setConsentDefaults as setGAConsentDefaults,
  updateConsent as updateGAConsent,
  isGtagLoaded,
  // Types
  type Gtag,
  type GtagCommand,
  type GA4StandardEvent,
  type GA4Item,
  type GA4EventParams,
  type GA4ConfigParams,
  type GtagConsentParams,
} from './google.js';

// ============================================================================
// Meta (Facebook) Pixel
// ============================================================================

export {
  // Core functions
  loadFbq,
  initFbq,
  fbq,
  // Convenience functions
  trackPageView as trackMetaPageView,
  trackViewContent as trackMetaViewContent,
  trackAddToCart as trackMetaAddToCart,
  trackAddToWishlist as trackMetaAddToWishlist,
  trackInitiateCheckout as trackMetaInitiateCheckout,
  trackAddPaymentInfo as trackMetaAddPaymentInfo,
  trackPurchase as trackMetaPurchase,
  trackLead as trackMetaLead,
  trackCompleteRegistration as trackMetaCompleteRegistration,
  trackSearch as trackMetaSearch,
  trackContact as trackMetaContact,
  trackSubscribe as trackMetaSubscribe,
  trackStartTrial as trackMetaStartTrial,
  trackCustom as trackMetaCustom,
  grantConsent as grantMetaConsent,
  revokeConsent as revokeMetaConsent,
  hashUserData as hashMetaUserData,
  isFbqLoaded,
  generateEventId as generateMetaEventId,
  // Types
  type Fbq,
  type MetaStandardEvent,
  type MetaContentInfo,
  type MetaLeadParams,
  type MetaPurchaseParams,
  type MetaSearchParams,
  type MetaViewContentParams,
  type MetaAddToCartParams,
  type MetaInitiateCheckoutParams,
  type MetaCompleteRegistrationParams,
  type MetaSubscribeParams,
  type MetaUserData,
  type MetaEventOptions,
} from './meta.js';

// ============================================================================
// TikTok Pixel
// ============================================================================

export {
  // Core functions
  loadTtq,
  initTtq,
  track as trackTikTok,
  trackPage as trackTikTokPage,
  identify as identifyTikTok,
  ttq,
  // Convenience functions
  trackViewContent as trackTikTokViewContent,
  trackClickButton as trackTikTokClickButton,
  trackSearch as trackTikTokSearch,
  trackAddToWishlist as trackTikTokAddToWishlist,
  trackAddToCart as trackTikTokAddToCart,
  trackInitiateCheckout as trackTikTokInitiateCheckout,
  trackAddPaymentInfo as trackTikTokAddPaymentInfo,
  trackCompletePayment as trackTikTokCompletePayment,
  trackPlaceAnOrder as trackTikTokPlaceAnOrder,
  trackContact as trackTikTokContact,
  trackDownload as trackTikTokDownload,
  trackSubmitForm as trackTikTokSubmitForm,
  trackCompleteRegistration as trackTikTokCompleteRegistration,
  trackSubscribe as trackTikTokSubscribe,
  enableCookie as enableTikTokCookie,
  disableCookie as disableTikTokCookie,
  holdConsent as holdTikTokConsent,
  grantConsent as grantTikTokConsent,
  revokeConsent as revokeTikTokConsent,
  debug as debugTikTok,
  hashUserData as hashTikTokUserData,
  isTtqLoaded,
  getInstance as getTikTokInstance,
  generateEventId as generateTikTokEventId,
  // Types
  type Ttq,
  type TtqInstance,
  type TikTokStandardEvent,
  type TikTokContentInfo,
  type TikTokEventParams,
  type TikTokUserData,
  type TikTokPageProperties,
  type TikTokIdentifyProperties,
} from './tiktok.js';

// ============================================================================
// LinkedIn Insight Tag
// ============================================================================

export {
  // Core functions
  loadLintrk,
  initLintrk,
  lintrk,
  // Convenience functions
  trackConversion as trackLinkedInConversion,
  trackPageView as trackLinkedInPageView,
  isLintrkLoaded,
  getPartnerId as getLinkedInPartnerId,
  getPartnerIds as getLinkedInPartnerIds,
  addPartnerId as addLinkedInPartnerId,
  // Types
  type Lintrk,
  type LinkedInConversionParams,
  type LinkedInConfig,
} from './linkedin.js';

// ============================================================================
// Snapchat Pixel
// ============================================================================

export {
  // Core functions
  loadSnap,
  initSnaptr,
  snaptr,
  // Convenience functions
  trackPageView as trackSnapPageView,
  trackViewContent as trackSnapViewContent,
  trackAddCart as trackSnapAddCart,
  trackAddToWishlist as trackSnapAddToWishlist,
  trackStartCheckout as trackSnapStartCheckout,
  trackAddBilling as trackSnapAddBilling,
  trackPurchase as trackSnapPurchase,
  trackSearch as trackSnapSearch,
  trackSignUp as trackSnapSignUp,
  trackLogin as trackSnapLogin,
  trackAppInstall as trackSnapAppInstall,
  trackAppOpen as trackSnapAppOpen,
  trackSubscribe as trackSnapSubscribe,
  trackStartTrial as trackSnapStartTrial,
  trackSave as trackSnapSave,
  trackShare as trackSnapShare,
  trackListView as trackSnapListView,
  trackCustom as trackSnapCustom,
  unbind as unbindSnap,
  rebind as rebindSnap,
  hashUserData as hashSnapUserData,
  isSnaptrLoaded,
  generateTransactionId as generateSnapTransactionId,
  // Types
  type Snaptr,
  type SnapchatStandardEvent,
  type SnapchatEventParams,
  type SnapchatUserData,
  type SnapchatInitOptions,
} from './snapchat.js';

// ============================================================================
// Twitter (X) Pixel
// ============================================================================

export {
  // Core functions
  loadTwq,
  initTwq,
  twq,
  // Convenience functions
  trackPageView as trackTwitterPageView,
  trackViewContent as trackTwitterViewContent,
  trackSearch as trackTwitterSearch,
  trackAddToCart as trackTwitterAddToCart,
  trackAddToWishlist as trackTwitterAddToWishlist,
  trackInitiateCheckout as trackTwitterInitiateCheckout,
  trackAddPaymentInfo as trackTwitterAddPaymentInfo,
  trackPurchase as trackTwitterPurchase,
  trackCompleteRegistration as trackTwitterCompleteRegistration,
  trackDownload as trackTwitterDownload,
  trackLead as trackTwitterLead,
  trackSubscribe as trackTwitterSubscribe,
  trackStartTrial as trackTwitterStartTrial,
  trackCustomEvent as trackTwitterCustomEvent,
  trackConversion as trackTwitterConversion,
  setParams as setTwitterParams,
  grantConsent as grantTwitterConsent,
  denyConsent as denyTwitterConsent,
  configure as configureTwitter,
  enableRestrictedDataUse as enableTwitterRestrictedDataUse,
  hashUserData as hashTwitterUserData,
  isTwqLoaded,
  generateOrderId as generateTwitterOrderId,
  // Types
  type Twq,
  type TwitterStandardEvent,
  type TwitterEventParams,
  type TwitterUserData,
  type TwitterInitOptions,
} from './twitter.js';

// ============================================================================
// Shared Utilities
// ============================================================================

export {
  loadScript,
  scriptLoaded,
  hashEmail,
  hashPhone,
  generateClientId,
  getOrCreateClientId,
} from './utils.js';
