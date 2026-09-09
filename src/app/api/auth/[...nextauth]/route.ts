import NextAuth from 'next-auth';
import TwitterProvider from 'next-auth/providers/twitter';
import { cookies } from 'next/headers';

const handler = NextAuth({
  providers: [
    TwitterProvider({
      clientId: process.env.TWITTER_CLIENT_ID!,
      clientSecret: process.env.TWITTER_CLIENT_SECRET!,
      version: '2.0',
      authorization: {
        url: 'https://twitter.com/i/oauth2/authorize',
        params: {
          scope: 'users.read tweet.read tweet.write offline.access',
        },
      },
    }),
  ],
  session: {
    strategy: 'jwt',
    // 30 days — effectively "never log out"
    maxAge: 30 * 24 * 60 * 60,
  },
  callbacks: {
    async jwt({ token, account, profile }) {
      // Persist the OAuth access token and provider account id to the token right after signin
      if (account) {
        token.accessToken = account.access_token;
        token.providerAccountId = account.providerAccountId;
        token.refreshToken = account.refresh_token;
        token.expiresAt = account.expires_at;

        // Read the pending accountId + proxy from cookies set before OAuth redirect
        try {
          const cookieStore = await cookies();
          const pendingAccountId = cookieStore.get('xautomate_pending_account_id')?.value;
          const pendingProxy = cookieStore.get('xautomate_pending_proxy')?.value;
          if (pendingAccountId) token.pendingAccountId = pendingAccountId;
          if (pendingProxy !== undefined) token.pendingProxy = pendingProxy;
        } catch { /* ignore — cookies may not be available in all contexts */ }
      }
      return token;
    },
    async session({ session, token }) {
      // Send access token and account binding info to the client
      (session as any).accessToken = token.accessToken;
      (session as any).userId = token.providerAccountId;
      (session as any).pendingAccountId = token.pendingAccountId;
      (session as any).pendingProxy = token.pendingProxy;
      return session;
    },
  },
  pages: {
    signIn: '/login',
    error: '/login',
  },
  secret: process.env.NEXTAUTH_SECRET,
});

export { handler };
