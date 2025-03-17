export const CONTACT_FORM_TEMPLATE = `
<!DOCTYPE html>
<html lang="es-AR">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>{{subject}}</title>
    <style> 
      body {
        font-family: "Trebuchet MS", Arial, sans-serif;
        line-height: 1.6;
        color: #333333;
        background-color: #f9f9f9;
        margin: 0;
        padding: 0;
      }
      .email-container {
        max-width: 600px;
        margin: 0 auto;
        background-color: #ffffff;
        border-radius: 8px;
        overflow: hidden;
        box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
      }
      .email-header {
        background-color: #2563EB;
        padding: 24px;
        text-align: center;
      }
      .email-header img {
        max-width: 72px;
        height: auto;
      }
      .email-content {
        padding: 32px 24px;
      }
      .email-footer {
        background-color: #f3f4f6;
        padding: 16px 24px;
        text-align: center;
        font-size: 14px;
        color: #6b7280;
      }
      h1 {
        color: black;
        margin-top: 0;
        font-size: 24px;
        font-weight: bold;
      }
      .message-box {
        background-color: #f3f4f6;
        border-radius: 6px;
        padding: 16px;
        margin-top: 24px;
        white-space: pre-wrap;
      }
      .field-row {
        margin-bottom: 12px;
      }
      .field-label {
        font-weight: 600;
        color: #4b5563;
      }
      @media only screen and (max-width: 600px) {
        .email-container {
          width: 100%;
          border-radius: 0;
        }
        .email-content {
          padding: 24px 16px;
        }
      }
    </style>
  </head>
  <body>
    <div class="email-container">
      <div class="email-header">
        <img
          src="{{baseUrl}}/assets/img/redentor_logo.png"
          alt="Logo de Iglesia de Cristo Redentor"
        />
      </div>
      <div class="email-content">
        <h1>{{title}}</h1>

        <div class="field-row">
          <span class="field-label">Nombre:</span> {{name}}
        </div>

        <div class="field-row">
          <span class="field-label">Email:</span>
          <a href="mailto:{{email}}">{{email}}</a>
        </div>

        <div class="field-row">
          <span class="field-label">Asunto:</span> {{subject}}
        </div>

        <h3>Mensaje:</h3>
        <div class="message-box">{{message}}</div>
      </div>
      <div class="email-footer">
        &copy; {{currentYear}} Iglesia de Cristo Redentor - Todos los derechos reservados
      </div>
    </div>
  </body>
</html>
`;
