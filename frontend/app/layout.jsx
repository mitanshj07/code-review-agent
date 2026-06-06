import './globals.css';

export const metadata = {
  title: 'CodeScope Dashboard',
  description: 'Code quality metrics and pull request scan activity for engineering leaders.'
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
