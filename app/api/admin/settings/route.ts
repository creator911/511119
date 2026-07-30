import {
  adminApiErrorResponse,
  adminJson,
  assertSameOrigin,
  readAdminJson,
  requireAdminApiSession,
} from "@/lib/admin-api";
import {
  getEffectiveSiteSettings,
  saveSiteSettings,
  validateSiteSettings,
} from "@/lib/site-content";
import {
  getLegacyAdminSettings,
  getLegacyProviderStatus,
  mergeLegacyStorefrontSettings,
  saveLegacyAdminSettings,
  validateLegacyAdminSettings,
} from "@/lib/legacy-admin-settings";

export async function GET(request: Request) {
  try {
    await requireAdminApiSession(request);
    assertSameOrigin(request);
    const [settings, legacySettings] = await Promise.all([
      getEffectiveSiteSettings({ strict: true }),
      getLegacyAdminSettings({ strict: true }),
    ]);
    return adminJson({
      ok: true,
      settings,
      legacySettings: mergeLegacyStorefrontSettings(
        legacySettings,
        settings,
      ),
      providerStatus: getLegacyProviderStatus(),
    });
  } catch (error) {
    return adminApiErrorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const session = await requireAdminApiSession(request);
    assertSameOrigin(request);
    const input = await readAdminJson(request, 128_000);
    if (
      input &&
      typeof input === "object" &&
      !Array.isArray(input) &&
      "legacySettings" in input
    ) {
      const body = input as Record<string, unknown>;
      const siteInput =
        body.siteSettings &&
        typeof body.siteSettings === "object" &&
        !Array.isArray(body.siteSettings)
          ? {
              ...body.siteSettings,
              paymentCardEnabled: false,
              paymentTransferEnabled: false,
              paymentVirtualEnabled: false,
              paymentMobileEnabled: false,
            }
          : body.siteSettings;
      const providerStatus = getLegacyProviderStatus();
      const validatedSiteSettings = validateSiteSettings(siteInput);
      const validatedLegacySettings = validateLegacyAdminSettings(
        body.legacySettings,
        providerStatus,
      );
      const settings = await saveSiteSettings(validatedSiteSettings, {
        adminUsername: session.username,
      });
      const legacySettings = await saveLegacyAdminSettings(
        validatedLegacySettings,
        {
          adminUsername: session.username,
        },
      );
      return adminJson({
        ok: true,
        settings,
        legacySettings: mergeLegacyStorefrontSettings(
          legacySettings,
          settings,
        ),
        providerStatus,
      });
    }
    const normalizedInput =
      input && typeof input === "object" && !Array.isArray(input)
        ? {
            ...input,
            paymentCardEnabled: false,
            paymentTransferEnabled: false,
            paymentVirtualEnabled: false,
            paymentMobileEnabled: false,
          }
        : input;
    const settings = await saveSiteSettings(normalizedInput, {
      adminUsername: session.username,
    });
    return adminJson({ ok: true, settings });
  } catch (error) {
    return adminApiErrorResponse(error);
  }
}
