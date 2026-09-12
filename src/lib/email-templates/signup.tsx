import * as React from "react";
import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Text,
  Link,
} from "@react-email/components";
import type { EmailLanguage } from "../email-languages";
import { authEmailPresentation } from "../auth-email-presentation";

interface SignupEmailProps {
  siteName: string;
  confirmationUrl: string;
  language?: EmailLanguage;
  siteUrl: string;
  recipient: string;
}

export const SignupEmail = ({
  siteName,
  confirmationUrl,
  language,
  siteUrl,
  recipient,
}: SignupEmailProps) => {
  const copy = authEmailPresentation(language, "signup", siteName);
  return (
    <Html lang={copy.locale} dir="ltr">
      <Head />
      <Preview>{copy.subject}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={h1}>{copy.title}</Heading>
          <Text style={text}>{copy.body}</Text>
          <Text style={text}>
            <Link href={siteUrl} style={link}>
              {siteName}
            </Link>{" "}
            ·{" "}
            <Link href={`mailto:${recipient}`} style={link}>
              {recipient}
            </Link>
          </Text>
          <Button style={button} href={confirmationUrl}>
            {copy.title}
          </Button>
          <Text style={footer}>{copy.ignore}</Text>
        </Container>
      </Body>
    </Html>
  );
};
export default SignupEmail;

const main = { backgroundColor: "#ffffff", fontFamily: "Arial, sans-serif" };
const container = { padding: "20px 25px" };
const h1 = {
  fontSize: "22px",
  fontWeight: "bold" as const,
  color: "#000000",
  margin: "0 0 20px",
};
const text = {
  fontSize: "14px",
  color: "#55575d",
  lineHeight: "1.5",
  margin: "0 0 25px",
};
const link = { color: "inherit", textDecoration: "underline" };
const button = {
  backgroundColor: "#000000",
  color: "#ffffff",
  fontSize: "14px",
  borderRadius: "8px",
  padding: "12px 20px",
  textDecoration: "none",
};
const footer = { fontSize: "12px", color: "#999999", margin: "30px 0 0" };
