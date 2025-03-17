"use server";

import { ContactDetails } from "@src/types/ContactDetails";
import { sendContactForm } from "@src/service/contact.service";
import { sendContactFormEmail } from "@src/service/contact-form-email.service";

type ActionResult = {
  success: boolean;
  message: string;
};

function isValidEmail(email: string): boolean {
  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  return emailRegex.test(email);
}

export async function handleContactFormSubmission(
  _: ActionResult | null,
  formData: FormData,
  requiredFields: string[]
): Promise<ActionResult> {
  try {
    const formValues = Object.fromEntries(formData.entries());
    
    for (const field of requiredFields) {
      if (!formValues[field]) {
        return { success: false, message: "Please fill in all required fields" };
      }
    }
    
    const email = formValues.email as string;
    if (email && !isValidEmail(email)) {
      return { success: false, message: "Please enter a valid email address" };
    }
    
    const contactDetails: ContactDetails = {
      name: formValues.name as string,
      email: email,
      subject: formValues.subject as string,
      message: formValues.message as string,
    };
    
    try {
      // Save to database
      const dbResult = await sendContactForm(contactDetails);
      
      // Send email notification
      const emailResult = await sendContactFormEmail(contactDetails);
      
      if (!dbResult.success) {
        console.error("Database operation failed");
      }
      
      if (!emailResult) {
        console.error("Email sending failed");
      }
      
      // Return success even if email fails, as long as DB operation succeeded
      if (dbResult.success) {
        return { success: true, message: "Your message was sent successfully!" };
      } else {
        throw new Error("Database operation failed");
      }
    } catch (dbError) {
      console.error("Database error:", dbError);
      return { 
        success: false, 
        message: "Failed to save your message. Please try again later." 
      };
    }
  } catch (error) {
    console.error("Error submitting contact form:", error);
    return { 
      success: false, 
      message: error instanceof Error ? error.message : "An unexpected error occurred" 
    };
  }
}