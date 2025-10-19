# Accessibility Spot-Check Plan

**Last updated: 2025-10-19**

## Manual Accessibility Testing Checklist

### Keyboard-Only Navigation Test

#### Test Environment Setup
- **Browser**: Chrome/Firefox with keyboard navigation
- **Screen Reader**: NVDA (Windows) or VoiceOver (Mac)
- **Tools**: Browser dev tools for ARIA inspection
- **Test User**: Create test account for authentication flows

#### Test Flow: Add Sale → Share → Open Shortlink

##### 1. Add Sale Page (`/explore?tab=add`)
**Keyboard Navigation:**
- [ ] **Tab Order**: Tab through all form elements in logical order
- [ ] **Focus Visible**: All focused elements have visible focus indicators
- [ ] **Form Labels**: All inputs have proper labels
- [ ] **Required Fields**: Required fields are clearly marked
- [ ] **Error Messages**: Error messages are announced to screen readers
- [ ] **Submit Button**: Form can be submitted with Enter key

**Screen Reader Testing:**
- [ ] **Page Title**: Page has descriptive title
- [ ] **Heading Structure**: Proper h1, h2, h3 hierarchy
- [ ] **Form Labels**: All inputs have accessible names
- [ ] **Error Announcements**: Errors are announced when they occur
- [ ] **Success Messages**: Success messages are announced

**Expected Results:**
- ✅ Tab order flows logically through form
- ✅ Focus indicators are clearly visible
- ✅ Screen reader announces all form elements
- ✅ Error messages are accessible
- ✅ Form submission works with keyboard

##### 2. Share Button (`/explore?tab=add`)
**Keyboard Navigation:**
- [ ] **Share Button**: Share button is keyboard accessible
- [ ] **Focus Management**: Focus moves to share modal/button
- [ ] **Modal/Dialog**: If modal opens, focus trapped inside
- [ ] **Close Button**: Modal can be closed with Escape key
- [ ] **Copy Link**: Link can be copied with keyboard

**Screen Reader Testing:**
- [ ] **Button Labels**: Share button has descriptive label
- [ ] **Modal Announcements**: Modal opening is announced
- [ ] **Link Information**: Copied link information is announced
- [ ] **Success Feedback**: Success message is announced

**Expected Results:**
- ✅ Share button accessible with keyboard
- ✅ Modal focus management works correctly
- ✅ Screen reader announces modal state changes
- ✅ Link copying works with keyboard
- ✅ Success feedback is accessible

##### 3. Open Shortlink (Anonymous)
**Keyboard Navigation:**
- [ ] **Link Access**: Shortlink can be accessed with keyboard
- [ ] **Page Load**: Page loads without focus issues
- [ ] **Map Interaction**: Map can be navigated with keyboard
- [ ] **Filter Controls**: Filter controls are keyboard accessible
- [ ] **Navigation**: Page navigation works with keyboard

**Screen Reader Testing:**
- [ ] **Page Title**: Page title reflects shared state
- [ ] **Map Description**: Map has proper ARIA labels
- [ ] **Filter Labels**: All filter controls have labels
- [ ] **State Announcements**: Map state changes are announced
- [ ] **Navigation**: Screen reader can navigate page structure

**Expected Results:**
- ✅ Shortlink loads without focus issues
- ✅ Map is keyboard navigable
- ✅ Filter controls are accessible
- ✅ Screen reader can navigate page
- ✅ State changes are announced

### Cluster Marker Accessibility

#### Map Cluster Markers
**Keyboard Navigation:**
- [ ] **Cluster Focus**: Clusters can be focused with keyboard
- [ ] **Cluster Information**: Cluster info is accessible
- [ ] **Zoom Action**: Cluster zoom action works with keyboard
- [ ] **Focus Management**: Focus moves appropriately
- [ ] **Escape Key**: Can exit cluster focus with Escape

**Screen Reader Testing:**
- [ ] **Cluster Labels**: Clusters have descriptive labels
- [ ] **Count Information**: Cluster count is announced
- [ ] **Action Instructions**: Zoom instructions are announced
- [ ] **Focus Changes**: Focus changes are announced
- [ ] **State Updates**: Cluster state updates are announced

**Expected Results:**
- ✅ Clusters are keyboard accessible
- ✅ Cluster information is announced
- ✅ Zoom actions work with keyboard
- ✅ Focus management is logical
- ✅ Screen reader announces all interactions

#### Individual Markers
**Keyboard Navigation:**
- [ ] **Marker Focus**: Individual markers can be focused
- [ ] **Marker Information**: Marker info is accessible
- [ ] **Popup Content**: Popup content is keyboard accessible
- [ ] **Close Actions**: Popup can be closed with keyboard
- [ ] **Navigation**: Can navigate between markers

**Screen Reader Testing:**
- [ ] **Marker Labels**: Markers have descriptive labels
- [ ] **Content Announcements**: Marker content is announced
- [ ] **Popup State**: Popup opening/closing is announced
- [ ] **Navigation**: Can navigate between markers
- [ ] **Content Reading**: Popup content is readable

**Expected Results:**
- ✅ Individual markers are keyboard accessible
- ✅ Marker information is announced
- ✅ Popup content is accessible
- ✅ Navigation between markers works
- ✅ Screen reader can read all content

### Focus Management

#### Focus Indicators
- [ ] **Visible Focus**: All focused elements have visible focus indicators
- [ ] **Focus Color**: Focus color has sufficient contrast
- [ ] **Focus Size**: Focus indicators are appropriately sized
- [ ] **Focus Shape**: Focus indicators are clearly defined
- [ ] **Focus Persistence**: Focus persists during interactions

#### Focus Trapping
- [ ] **Modal Focus**: Focus trapped in modals/dialogs
- [ ] **Tab Order**: Tab order is logical and predictable
- [ ] **Skip Links**: Skip links available for long pages
- [ ] **Focus Return**: Focus returns to trigger after modal close
- [ ] **Focus Management**: Focus moves appropriately during state changes

### ARIA Implementation

#### ARIA Labels
- [ ] **Map Labels**: Map has proper ARIA labels
- [ ] **Button Labels**: All buttons have descriptive labels
- [ ] **Form Labels**: All form elements have labels
- [ ] **Navigation Labels**: Navigation elements have labels
- [ ] **State Labels**: State changes are properly labeled

#### ARIA States
- [ ] **Expanded States**: Expandable elements have proper states
- [ ] **Selected States**: Selected elements are properly marked
- [ ] **Disabled States**: Disabled elements are properly marked
- [ ] **Loading States**: Loading states are announced
- [ ] **Error States**: Error states are properly marked

### Screen Reader Testing

#### Navigation
- [ ] **Heading Navigation**: Can navigate by headings
- [ ] **Landmark Navigation**: Can navigate by landmarks
- [ ] **Link Navigation**: Can navigate by links
- [ ] **Form Navigation**: Can navigate by form elements
- [ ] **Table Navigation**: Can navigate by table structure

#### Content Reading
- [ ] **Text Content**: All text content is readable
- [ ] **Image Alt Text**: Images have appropriate alt text
- [ ] **Link Context**: Links have descriptive context
- [ ] **Button Context**: Buttons have descriptive context
- [ ] **Form Context**: Form elements have descriptive context

### Keyboard Shortcuts

#### Map Navigation
- [ ] **Arrow Keys**: Arrow keys pan the map
- [ ] **Zoom Keys**: +/- keys zoom the map
- [ ] **Enter Key**: Enter key activates clusters
- [ ] **Escape Key**: Escape key clears focus
- [ ] **Tab Key**: Tab key navigates between elements

#### Form Navigation
- [ ] **Tab Key**: Tab key moves between form elements
- [ ] **Shift+Tab**: Shift+Tab moves backward
- [ ] **Enter Key**: Enter key submits forms
- [ ] **Escape Key**: Escape key cancels actions
- [ ] **Space Key**: Space key activates buttons

### Testing Tools

#### Browser Tools
- **Chrome DevTools**: Accessibility panel
- **Firefox DevTools**: Accessibility panel
- **Safari Web Inspector**: Accessibility panel
- **Browser Extensions**: axe-core, WAVE

#### Screen Readers
- **NVDA**: Windows (free)
- **JAWS**: Windows (commercial)
- **VoiceOver**: Mac (built-in)
- **Orca**: Linux (free)

#### Testing Checklist
- [ ] **Color Contrast**: All text meets WCAG AA standards
- [ ] **Keyboard Navigation**: All functionality accessible via keyboard
- [ ] **Screen Reader**: All content accessible to screen readers
- **Focus Management**: Focus moves logically and predictably
- [ ] **ARIA Implementation**: Proper ARIA labels and states
- [ ] **Error Handling**: Errors are announced and accessible
- [ ] **Success Feedback**: Success messages are announced

### Common Issues to Check

#### Focus Issues
- [ ] **Missing Focus**: Elements that should be focusable aren't
- [ ] **Focus Trapping**: Focus not trapped in modals
- [ ] **Focus Order**: Tab order is illogical
- [ ] **Focus Indicators**: Focus indicators not visible
- [ ] **Focus Loss**: Focus lost during interactions

#### ARIA Issues
- [ ] **Missing Labels**: Elements without accessible names
- [ ] **Incorrect States**: ARIA states not updated
- [ ] **Redundant Labels**: Redundant or confusing labels
- [ ] **Missing Roles**: Elements without proper roles
- [ ] **Incorrect Roles**: Elements with wrong roles

#### Content Issues
- [ ] **Missing Alt Text**: Images without alt text
- [ ] **Poor Descriptions**: Unclear or missing descriptions
- [ ] **Missing Context**: Links without context
- [ ] **Unclear Instructions**: Unclear user instructions
- [ ] **Missing Error Messages**: Errors not announced

### Testing Schedule

#### Pre-Release
- [ ] **Full A11y Test**: Complete accessibility testing
- [ ] **Keyboard Test**: Full keyboard navigation test
- [ ] **Screen Reader Test**: Full screen reader testing
- [ ] **Color Contrast Test**: Color contrast verification
- [ ] **Focus Test**: Focus management testing

#### Post-Release
- [ ] **Spot Check**: Quick accessibility verification
- [ ] **User Feedback**: Monitor for accessibility issues
- [ ] **Performance Check**: Ensure accessibility doesn't impact performance
- [ ] **Update Documentation**: Update accessibility documentation
- [ ] **Plan Improvements**: Plan accessibility improvements

### Resources

#### Documentation
- [WCAG 2.1 Guidelines](https://www.w3.org/WAI/WCAG21/quickref/)
- [ARIA Authoring Practices](https://www.w3.org/WAI/ARIA/apg/)
- [WebAIM Resources](https://webaim.org/)

#### Tools
- [axe-core](https://github.com/dequelabs/axe-core)
- [WAVE](https://wave.webaim.org/)
- [Color Contrast Analyzer](https://www.tpgi.com/color-contrast-checker/)

#### Testing
- [Accessibility Testing Guide](https://webaim.org/articles/testing/)
- [Screen Reader Testing](https://webaim.org/articles/screenreader_testing/)
- [Keyboard Testing](https://webaim.org/articles/keyboard_testing/)
