# 🎯 Contribute to Open Source

Thank you for helping improve this project.

## 📋 Code of Conduct

This project follows the [Code of Conduct](./CODE_OF_CONDUCT.md). By participating, you agree to respect it.

## 💖 Ways to Contribute

You can help by:

- fixing bugs
- improving documentation
- adding tests
- reviewing open issues
- proposing improvements

## 🧬 Development

Please open pull requests against the `dev` branch. Pull requests opened against `main` are not accepted.

### 🔧 Local setup

1. Clone the repository.
2. Enable Corepack and install dependencies.
3. Copy `.env.example` to `.env`.
4. Fill in the required Discord, Unthread, PostgreSQL, and Redis values.
5. Start working locally.

```bash
git clone https://github.com/your-username/unthread-discord-bot.git
cd unthread-discord-bot
corepack enable
pnpm install
cp .env.example .env
pnpm dev
```

### ✅ Before you open a pull request

Run the existing checks:

```bash
pnpm lint
pnpm build
pnpm test
```

If you change slash commands, deploy them again while testing locally:

```bash
pnpm deploycommand
```

### 📖 Documentation contributions

Documentation improvements are always welcome, including:

- README updates
- setup clarification
- troubleshooting improvements
- typos and wording fixes

## 🐞 Reporting Bugs

- For security issues, use the [security policy](./SECURITY.md).
- For other bugs, open a GitHub issue.

---

💻 with ❤️ by [Waren Gonzaga](https://warengonzaga.com), [WG Technology Labs](https://wgtechlabs.com), and [Him](https://www.youtube.com/watch?v=HHrxS4diLew&t=44s) 🙏
