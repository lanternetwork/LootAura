module.exports = {
  rules: {
    // Prevent hard-coded display styles on grid containers
    'no-inline-styles': {
      meta: {
        type: 'problem',
        docs: {
          description: 'Prevent inline styles that override grid layout',
          category: 'Layout'
        },
        fixable: null,
        schema: []
      },
      create(context) {
        return {
          JSXAttribute(node) {
            if (node.name.name === 'style' && node.value.type === 'JSXExpressionContainer') {
              const styleValue = node.value.expression
              if (styleValue.type === 'ObjectExpression') {
                const properties = styleValue.properties
                const hasGridOverride = properties.some(prop => {
                  if (prop.key.type === 'Literal' && prop.key.value === 'display') {
                    return prop.value.type === 'Literal' && prop.value.value !== 'grid'
                  }
                  if (prop.key.type === 'Literal' && prop.key.value === 'gridTemplateColumns') {
                    return true // Any inline gridTemplateColumns is suspicious
                  }
                  return false
                })
                
                if (hasGridOverride) {
                  context.report({
                    node,
                    message: 'Avoid inline styles that override grid layout. Use Tailwind classes instead.'
                  })
                }
              }
            }
          }
        }
      }
    },
    
    // Prevent wrapper divs around grid items
    'no-grid-wrappers': {
      meta: {
        type: 'problem',
        docs: {
          description: 'Prevent wrapper divs around grid items',
          category: 'Layout'
        },
        fixable: null,
        schema: []
      },
      create(context) {
        return {
          JSXElement(node) {
            if (node.openingElement.name.name === 'div') {
              const className = node.openingElement.attributes.find(
                attr => attr.name.name === 'className'
              )
              
              if (className && className.value.type === 'Literal') {
                const classValue = className.value.value
                if (classValue.includes('grid-item') || classValue.includes('grid-wrapper')) {
                  context.report({
                    node,
                    message: 'Avoid wrapper divs around grid items. Grid items should be direct children of the grid container.'
                  })
                }
              }
            }
          }
        }
      }
    }
  }
}