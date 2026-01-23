# Supabase Auth Email Templates for LootAura

These templates should be pasted into the Supabase Dashboard → Authentication → Email Templates section.

**Logo URL**: `https://lootaura.com/images/logo-white.png` (or use your production domain)
**Brand Color**: `#3A2268`
**Product Name**: LootAura

---

## 1. Confirm Signup

**Subject**: `Confirm your LootAura account`

**HTML**:

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Confirm your LootAura account</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f5f5f5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color: #f5f5f5;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="max-width: 600px; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
          <!-- Header -->
          <tr>
            <td style="background-color: #3A2268; padding: 24px; text-align: center;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td align="center">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td style="vertical-align: middle; padding-right: 8px;">
                          <img src="https://lootaura.com/images/logo-white.png" alt="LootAura" width="32" height="32" style="display: block; width: 32px; height: 32px;">
                        </td>
                        <td style="vertical-align: middle;">
                          <span style="color: #ffffff; font-size: 24px; font-weight: bold; margin: 0;">LootAura</span>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Content -->
          <tr>
            <td style="padding: 32px 24px;">
              <h1 style="margin: 0 0 16px 0; font-size: 24px; font-weight: 600; color: #1a1a1a; line-height: 1.4;">Confirm your account</h1>
              <p style="margin: 0 0 24px 0; font-size: 16px; line-height: 1.6; color: #4a4a4a;">Thanks for signing up for LootAura! Please confirm your email address to complete your account setup.</p>
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td align="center" style="padding: 24px 0;">
                    <a href="{{ .ConfirmationURL }}" style="display: inline-block; padding: 14px 28px; background-color: #3A2268; color: #ffffff; text-decoration: none; border-radius: 6px; font-size: 16px; font-weight: 600;">Confirm email address</a>
                  </td>
                </tr>
              </table>
              <p style="margin: 24px 0 0 0; font-size: 14px; line-height: 1.6; color: #666666;">If the button doesn't work, copy and paste this link into your browser:</p>
              <p style="margin: 8px 0 0 0; font-size: 14px; line-height: 1.6; color: #3A2268; word-break: break-all;">{{ .ConfirmationURL }}</p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background-color: #f9f9f9; padding: 24px; border-top: 1px solid #e5e5e5;">
              <p style="margin: 0; font-size: 12px; line-height: 18px; color: #666666; text-align: center;">You received this email from LootAura. Visit <a href="https://lootaura.com" style="color: #3A2268; text-decoration: underline;">lootaura.com</a> to manage your account.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
```

---

## 2. Magic Link Login

**Subject**: `Sign in to LootAura`

**HTML**:

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Sign in to LootAura</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f5f5f5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color: #f5f5f5;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="max-width: 600px; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
          <!-- Header -->
          <tr>
            <td style="background-color: #3A2268; padding: 24px; text-align: center;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td align="center">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td style="vertical-align: middle; padding-right: 8px;">
                          <img src="https://lootaura.com/images/logo-white.png" alt="LootAura" width="32" height="32" style="display: block; width: 32px; height: 32px;">
                        </td>
                        <td style="vertical-align: middle;">
                          <span style="color: #ffffff; font-size: 24px; font-weight: bold; margin: 0;">LootAura</span>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Content -->
          <tr>
            <td style="padding: 32px 24px;">
              <h1 style="margin: 0 0 16px 0; font-size: 24px; font-weight: 600; color: #1a1a1a; line-height: 1.4;">Sign in to your account</h1>
              <p style="margin: 0 0 24px 0; font-size: 16px; line-height: 1.6; color: #4a4a4a;">Click the button below to securely sign in to your LootAura account. This link will expire soon.</p>
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td align="center" style="padding: 24px 0;">
                    <a href="{{ .ConfirmationURL }}" style="display: inline-block; padding: 14px 28px; background-color: #3A2268; color: #ffffff; text-decoration: none; border-radius: 6px; font-size: 16px; font-weight: 600;">Sign in to LootAura</a>
                  </td>
                </tr>
              </table>
              <p style="margin: 24px 0 0 0; font-size: 14px; line-height: 1.6; color: #666666;">If the button doesn't work, copy and paste this link into your browser:</p>
              <p style="margin: 8px 0 0 0; font-size: 14px; line-height: 1.6; color: #3A2268; word-break: break-all;">{{ .ConfirmationURL }}</p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background-color: #f9f9f9; padding: 24px; border-top: 1px solid #e5e5e5;">
              <p style="margin: 0; font-size: 12px; line-height: 18px; color: #666666; text-align: center;">You received this email from LootAura. Visit <a href="https://lootaura.com" style="color: #3A2268; text-decoration: underline;">lootaura.com</a> to manage your account.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
```

---

## 3. Reset Password

**Subject**: `Reset your LootAura password`

**HTML**:

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Reset your LootAura password</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f5f5f5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color: #f5f5f5;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="max-width: 600px; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
          <!-- Header -->
          <tr>
            <td style="background-color: #3A2268; padding: 24px; text-align: center;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td align="center">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td style="vertical-align: middle; padding-right: 8px;">
                          <img src="https://lootaura.com/images/logo-white.png" alt="LootAura" width="32" height="32" style="display: block; width: 32px; height: 32px;">
                        </td>
                        <td style="vertical-align: middle;">
                          <span style="color: #ffffff; font-size: 24px; font-weight: bold; margin: 0;">LootAura</span>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Content -->
          <tr>
            <td style="padding: 32px 24px;">
              <h1 style="margin: 0 0 16px 0; font-size: 24px; font-weight: 600; color: #1a1a1a; line-height: 1.4;">Reset your password</h1>
              <p style="margin: 0 0 24px 0; font-size: 16px; line-height: 1.6; color: #4a4a4a;">We received a request to reset your password. Click the button below to create a new password. This link will expire soon.</p>
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td align="center" style="padding: 24px 0;">
                    <a href="{{ .ConfirmationURL }}" style="display: inline-block; padding: 14px 28px; background-color: #3A2268; color: #ffffff; text-decoration: none; border-radius: 6px; font-size: 16px; font-weight: 600;">Reset password</a>
                  </td>
                </tr>
              </table>
              <p style="margin: 24px 0 0 0; font-size: 14px; line-height: 1.6; color: #666666;">If you didn't request a password reset, you can safely ignore this email.</p>
              <p style="margin: 16px 0 0 0; font-size: 14px; line-height: 1.6; color: #666666;">If the button doesn't work, copy and paste this link into your browser:</p>
              <p style="margin: 8px 0 0 0; font-size: 14px; line-height: 1.6; color: #3A2268; word-break: break-all;">{{ .ConfirmationURL }}</p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background-color: #f9f9f9; padding: 24px; border-top: 1px solid #e5e5e5;">
              <p style="margin: 0; font-size: 12px; line-height: 18px; color: #666666; text-align: center;">You received this email from LootAura. Visit <a href="https://lootaura.com" style="color: #3A2268; text-decoration: underline;">lootaura.com</a> to manage your account.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
```

---

## 4. Change Email

**Subject**: `Confirm your new LootAura email address`

**HTML**:

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Confirm your new LootAura email address</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f5f5f5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color: #f5f5f5;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="max-width: 600px; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
          <!-- Header -->
          <tr>
            <td style="background-color: #3A2268; padding: 24px; text-align: center;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td align="center">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td style="vertical-align: middle; padding-right: 8px;">
                          <img src="https://lootaura.com/images/logo-white.png" alt="LootAura" width="32" height="32" style="display: block; width: 32px; height: 32px;">
                        </td>
                        <td style="vertical-align: middle;">
                          <span style="color: #ffffff; font-size: 24px; font-weight: bold; margin: 0;">LootAura</span>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Content -->
          <tr>
            <td style="padding: 32px 24px;">
              <h1 style="margin: 0 0 16px 0; font-size: 24px; font-weight: 600; color: #1a1a1a; line-height: 1.4;">Confirm your new email address</h1>
              <p style="margin: 0 0 24px 0; font-size: 16px; line-height: 1.6; color: #4a4a4a;">You requested to change your email address. Click the button below to confirm this new email address for your LootAura account.</p>
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td align="center" style="padding: 24px 0;">
                    <a href="{{ .ConfirmationURL }}" style="display: inline-block; padding: 14px 28px; background-color: #3A2268; color: #ffffff; text-decoration: none; border-radius: 6px; font-size: 16px; font-weight: 600;">Confirm email address</a>
                  </td>
                </tr>
              </table>
              <p style="margin: 24px 0 0 0; font-size: 14px; line-height: 1.6; color: #666666;">If you didn't request this change, you can safely ignore this email.</p>
              <p style="margin: 16px 0 0 0; font-size: 14px; line-height: 1.6; color: #666666;">If the button doesn't work, copy and paste this link into your browser:</p>
              <p style="margin: 8px 0 0 0; font-size: 14px; line-height: 1.6; color: #3A2268; word-break: break-all;">{{ .ConfirmationURL }}</p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background-color: #f9f9f9; padding: 24px; border-top: 1px solid #e5e5e5;">
              <p style="margin: 0; font-size: 12px; line-height: 18px; color: #666666; text-align: center;">You received this email from LootAura. Visit <a href="https://lootaura.com" style="color: #3A2268; text-decoration: underline;">lootaura.com</a> to manage your account.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
```

---

## Implementation Notes

1. **Logo URL**: Update `https://lootaura.com/images/logo-white.png` to match your production domain if different
2. **Template Variables**: All Supabase template variables (e.g., `{{ .ConfirmationURL }}`) are preserved
3. **Email Client Compatibility**: Templates use table-based layouts and inline styles for maximum email client compatibility
4. **Testing**: After updating templates in Supabase Dashboard, test by:
   - Signing up a new account (confirm signup)
   - Requesting a magic link (magic link login)
   - Requesting a password reset (reset password)
   - Changing email address (change email)

## Subject Lines Summary

- **Confirm Signup**: `Confirm your LootAura account`
- **Magic Link Login**: `Sign in to LootAura`
- **Reset Password**: `Reset your LootAura password`
- **Change Email**: `Confirm your new LootAura email address`
