import "./globals.css";

export const metadata = {
  title: "Timbre Signal",
  description: "Find creators, score the fit, reach out.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
