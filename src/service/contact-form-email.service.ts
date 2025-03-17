import { renderTemplate } from "@src/templates/template-engine";
import { ContactDetails } from "@src/types/ContactDetails";
import { FROM_EMAIL, sendEmail } from "./mailing.service";

const RECIPIENT_EMAIL = process.env.CONTACT_FORM_RECIPIENT_EMAIL ?? FROM_EMAIL;

export async function sendContactFormEmail(
  contactDetails: ContactDetails,
): Promise<boolean> {
  try {
    const { name, email, subject, message } = contactDetails;

    // Plain text version (for email clients that don't support HTML)
    const plainTextContent = `
      Nuevo mensaje del formulario de contacto:
      
      Nombre: ${name}
      Email: ${email}
      Asunto: ${subject}
      
      Mensaje:
      ${message}
    `;

    // Render the HTML template with the contact details
    const htmlContent = renderTemplate("contact-form", {
      title: "Nuevo mensaje del formulario de contacto",
      name,
      email,
      subject,
      message: message.replace(/\n/g, "<br>"),
    });

    return await sendEmail({
      to: RECIPIENT_EMAIL,
      subject: `Nuevo mensaje de Contacto: ${subject}`,
      text: plainTextContent,
      html: htmlContent,
    });
  } catch (error) {
    console.error("Error preparing contact form email:", error);
    return false;
  }
}
