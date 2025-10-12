/**
 * ESLint rules to prevent grid layout regressions
 * These rules ensure proper grid implementation and prevent common issues
 */

module.exports = {
  rules: {
    // Prevent conflicting layout styles
    'no-inline-styles-with-grid': {
      create(context) {
        return {
          JSXAttribute(node) {
            if (node.name.name === 'style' && node.value.type === 'JSXExpressionContainer') {
              const styleValue = node.value.expression
              if (styleValue.type === 'ObjectExpression') {
                const hasGridDisplay = styleValue.properties.some(prop => 
                  prop.key.name === 'display' && 
                  prop.value.value === 'grid'
                )
                const hasGridTemplate = styleValue.properties.some(prop => 
                  prop.key.name === 'gridTemplateColumns'
                )
                
                if (hasGridDisplay || hasGridTemplate) {
                  context.report({
                    node,
                    message: 'Avoid inline grid styles. Use CSS classes or the SalesGrid component instead.'
                  })
                }
              }
            }
          }
        }
      }
    },
    
    // Ensure proper grid container structure
    'grid-container-structure': {
      create(context) {
        return {
          JSXElement(node) {
            const hasGridClass = node.openingElement.attributes.some(attr => 
              attr.type === 'JSXAttribute' && 
              attr.name.name === 'className' &&
              attr.value.value.includes('grid')
            )
            
            const hasDataAttribute = node.openingElement.attributes.some(attr => 
              attr.type === 'JSXAttribute' && 
              attr.name.name === 'data-testid' &&
              attr.value.value === 'sales-grid'
            )
            
            if (hasGridClass && !hasDataAttribute) {
              context.report({
                node,
                message: 'Grid containers should have data-testid="sales-grid" for testing.'
              })
            }
          }
        }
      }
    },
    
    // Prevent flex conflicts with grid
    'no-flex-in-grid-items': {
      create(context) {
        return {
          JSXElement(node) {
            const isGridContainer = node.openingElement.attributes.some(attr => 
              attr.type === 'JSXAttribute' && 
              attr.name.name === 'className' &&
              attr.value.value.includes('grid')
            )
            
            if (isGridContainer) {
              // Check for flex classes in grid container
              const hasFlexClass = node.openingElement.attributes.some(attr => 
                attr.type === 'JSXAttribute' && 
                attr.name.name === 'className' &&
                attr.value.value.includes('flex')
              )
              
              if (hasFlexClass) {
                context.report({
                  node,
                  message: 'Avoid flex classes on grid containers. Use grid layout instead.'
                })
              }
            }
          }
        }
      }
    }
  }
}
