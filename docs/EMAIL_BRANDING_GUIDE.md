# LootAura Email Branding Guide

This guide explains how to update Supabase email templates with LootAura branding and professional formatting.

## Overview

Supabase sends several types of authentication emails that need to be branded:
- **Email Confirmation** - When users sign up
- **Password Reset** - When users request password reset
- **Magic Link** - When users request magic link login
- **Email Change** - When users change their email

## Accessing Email Templates

1. Go to your **Supabase Dashboard**
2. Navigate to **Authentication** → **Email Templates**
3. You'll see templates for each email type

## Branding Updates Needed

### 1. Email Confirmation Template

**Current Issues:**
- References "Supabase" in sender name
- Generic Supabase branding
- Basic HTML formatting

**Updates Needed:**
- Change sender name to "LootAura"
- Update subject line to be more engaging
- Add LootAura logo and branding
- Improve HTML design and formatting
- Update footer with LootAura contact info

### 2. Password Reset Template

**Updates Needed:**
- LootAura branding
- Professional design
- Clear call-to-action
- Updated sender information

### 3. Magic Link Template

**Updates Needed:**
- LootAura branding
- Consistent design with other emails
- Clear instructions

### 4. Email Change Template

**Updates Needed:**
- LootAura branding
- Security-focused messaging
- Professional appearance

## Template Customization

### Subject Lines

**Email Confirmation:**
```
Current: "Confirm your signup"
Updated: "Welcome to LootAura! Please confirm your email"
```

**Password Reset:**
```
Current: "Reset your password"
Updated: "Reset your LootAura password"
```

**Magic Link:**
```
Current: "Your magic link"
Updated: "Your LootAura login link"
```

**Email Change:**
```
Current: "Confirm your email change"
Updated: "Confirm your LootAura email change"
```

### HTML Template Structure

Each template should include:

1. **Header**
   - LootAura logo
   - Professional styling

2. **Body**
   - Clear, friendly messaging
   - LootAura branding
   - Call-to-action button

3. **Footer**
   - LootAura contact information
   - Unsubscribe link (if applicable)
   - Privacy policy link

### CSS Styling

Use modern, responsive CSS:
- Clean typography
- LootAura color scheme
- Mobile-friendly design
- Professional appearance

## Implementation Steps

### Step 1: Design Email Templates

Create HTML templates with:
- LootAura logo and branding
- Professional color scheme
- Responsive design
- Clear call-to-action buttons

### Step 2: Update Supabase Templates

1. Go to **Authentication** → **Email Templates**
2. For each template type:
   - Update the subject line
   - Replace the HTML content
   - Test the template

### Step 3: Test Email Delivery

1. Send test emails to verify:
   - Proper rendering
   - Link functionality
   - Branding consistency
   - Mobile responsiveness

### Step 4: Monitor and Iterate

1. Monitor email delivery rates
2. Gather user feedback
3. Iterate on design and content

## Template Variables

Supabase provides these variables for use in templates:

- `{{ .ConfirmationURL }}` - Email confirmation link
- `{{ .Token }}` - Confirmation token
- `{{ .Email }}` - User's email address
- `{{ .SiteURL }}` - Your site URL
- `{{ .RedirectTo }}` - Redirect URL after confirmation

## Best Practices

### Design
- Keep emails simple and focused
- Use clear, readable fonts
- Include plenty of white space
- Make call-to-action buttons prominent

### Content
- Use friendly, professional tone
- Be clear about what the user needs to do
- Include helpful instructions
- Provide support contact information

### Technical
- Test across different email clients
- Ensure links work correctly
- Use proper HTML structure
- Include alt text for images

## Security Considerations

- Never include sensitive information in emails
- Use HTTPS for all links
- Validate all user inputs
- Follow email security best practices

## Monitoring and Analytics

Track email performance:
- Delivery rates
- Open rates
- Click-through rates
- User engagement

## Support and Maintenance

- Regularly review email templates
- Update branding as needed
- Monitor for delivery issues
- Keep templates current with app changes

## Example Template Structure

```html
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>LootAura Email Confirmation</title>
    <style>
        /* LootAura email styles */
        body { font-family: Arial, sans-serif; }
        .container { max-width: 600px; margin: 0 auto; }
        .header { background: #your-brand-color; }
        .button { background: #your-brand-color; color: white; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <img src="https://your-domain.com/logo.png" alt="LootAura" />
        </div>
        <div class="content">
            <h1>Welcome to LootAura!</h1>
            <p>Please confirm your email address to get started.</p>
            <a href="{{ .ConfirmationURL }}" class="button">Confirm Email</a>
        </div>
        <div class="footer">
            <p>© 2025 LootAura. All rights reserved.</p>
        </div>
    </div>
</body>
</html>
```

## Next Steps

1. **Create branded email templates** with LootAura design
2. **Update Supabase email templates** with new content
3. **Test email delivery** across different clients
4. **Monitor performance** and gather feedback
5. **Iterate and improve** based on results

This guide provides the foundation for creating professional, branded email templates that enhance the user experience and reinforce the LootAura brand.
