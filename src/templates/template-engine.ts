import { TEMPLATES } from ".";

/**
 * Renders an email template by replacing placeholders with actual values
 *
 * @param templateName Name of the template
 * @param variables Object containing key-value pairs to replace in the template
 * @returns Processed HTML content with variables replaced
 */
export function renderTemplate(
  templateName: string,
  variables: Record<string, string>,
): string {
  try {
    const templateContent = TEMPLATES[templateName];

    if (!templateContent) {
      throw new Error(`Template "${templateName}" not found`);
    }

    if (!variables.currentYear) {
      variables.currentYear = new Date().getFullYear().toString();
    }

    if (!variables.baseUrl) {
      variables.baseUrl = process.env.NEXT_PUBLIC_BASE_URL;
    }

    // Replace all placeholders with values
    return Object.entries(variables).reduce((content, [key, value]) => {
      const regex = new RegExp(`{{${key}}}`, "g");
      return content.replace(regex, value);
    }, templateContent);
    
  } catch (error) {
    console.error(`Error rendering template ${templateName}:`, error);
    throw new Error(`Failed to render email template: ${templateName}`);
  }
}
