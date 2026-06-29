import type { BroadcastLocale } from "@src/service/broadcast/types";

interface BroadcastChrome {
  logoAlt: string;
  /** May contain {{currentYear}} — resolved by renderTemplate. */
  footer: string;
  unsubscribeLabel: string;
}

export const BROADCAST_CHROME: Record<BroadcastLocale, BroadcastChrome> = {
  "es-AR": {
    logoAlt: "Logo de Iglesia de Cristo Redentor",
    footer: "&copy; {{currentYear}} Iglesia de Cristo Redentor. Todos los derechos reservados.",
    unsubscribeLabel: "Cancelar suscripción",
  },
  "en-US": {
    logoAlt: "Church of Christ the Redeemer logo",
    footer: "&copy; {{currentYear}} Church of Christ the Redeemer. All rights reserved.",
    unsubscribeLabel: "Unsubscribe",
  },
};

export const BROADCAST_TEMPLATE = `
<!DOCTYPE html>
<html lang="{{lang}}">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <style>
      body { font-family: "Trebuchet MS", Arial, sans-serif; line-height: 1.6; color: #333; background:#f9f9f9; margin:0; padding:0; }
      .email-container { max-width:600px; margin:0 auto; background:#fff; border-radius:8px; overflow:hidden; box-shadow:0 4px 6px rgba(0,0,0,.1); }
      .email-header { background:#2563EB; padding:24px; text-align:center; }
      .email-header img { max-width:72px; height:auto; }
      .email-content { padding:32px 24px; }
      .email-footer { background:#f3f4f6; padding:16px 24px; text-align:center; font-size:14px; color:#6b7280; }
      @media only screen and (max-width:600px){ .email-container{width:100%;border-radius:0;} .email-content{padding:24px 16px;} }
    </style>
  </head>
  <body>
    <div class="email-container">
      <div class="email-header">
        <img src="{{baseUrl}}/assets/img/redentor_logo.png" alt="{{logoAlt}}" />
      </div>
      <div class="email-content">{{body}}</div>
      <div class="email-footer">
        {{footer}}<br />
        {{postalAddress}}<br />
        <a href="{{{RESEND_UNSUBSCRIBE_URL}}}">{{unsubscribeLabel}}</a>
      </div>
    </div>
  </body>
</html>
`;
