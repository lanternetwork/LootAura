module.exports = {
  rules: {
    'no-inline-grid-styles': {
      meta: {
        type: 'problem',
        docs: {
          description: 'Disallow inline grid styles that conflict with the SalesGrid component',
          category: 'Possible Errors',
          recommended: true,
        },
        schema: [],
      },
      create(context) {
        return {
          JSXAttribute(node) {
            if (node.name.name === 'style' && node.parent.name.name === 'div') {
              const styleProps = node.value.expression.properties;
              const hasGridDisplay = styleProps.some(
                (prop) =>
                  prop.key.name === 'display' &&
                  prop.value.value &&
                  prop.value.value.includes('grid')
              );
              const hasGridTemplateColumns = styleProps.some(
                (prop) => prop.key.name === 'gridTemplateColumns'
              );

              if (hasGridDisplay || hasGridTemplateColumns) {
                context.report({
                  node,
                  message:
                    'Avoid inline `display: grid` or `gridTemplateColumns` styles. Use the `SalesGrid` component or `app/globals.css` for grid definitions.',
                });
              }
            }
          },
          // You can add more checks here, e.g., for conflicting Tailwind classes
        };
      },
    },
    'no-direct-sale-card-grid-children': {
      meta: {
        type: 'problem',
        docs: {
          description: 'Ensure SaleCard components are not direct children of grid containers to prevent flex conflicts',
          category: 'Possible Errors',
          recommended: true,
        },
        schema: [],
      },
      create(context) {
        return {
          JSXElement(node) {
            if (node.openingElement.name.name === 'SaleCard') {
              const parent = node.parent;
              if (parent && parent.type === 'JSXElement') {
                const parentClasses = parent.openingElement.attributes.find(
                  (attr) => attr.type === 'JSXAttribute' && attr.name.name === 'className'
                );
                const parentStyles = parent.openingElement.attributes.find(
                  (attr) => attr.type === 'JSXAttribute' && attr.name.name === 'style'
                );

                const isParentGrid =
                  (parentClasses && parentClasses.value.type === 'Literal' && parentClasses.value.value.includes('grid')) ||
                  (parentStyles && parentStyles.value.expression.properties.some(
                    (prop) => prop.key.name === 'display' && prop.value.value && prop.value.value.includes('grid')
                  ));

                if (isParentGrid) {
                  context.report({
                    node,
                    message:
                      'SaleCard should not be a direct child of a grid container. Wrap it in a `SalesGridItem` or similar component to prevent layout conflicts.',
                  });
                }
              }
            }
          },
        };
      },
    },
  },
};