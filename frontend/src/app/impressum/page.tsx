import Link from "next/link";

export const metadata = { title: "Impressum – LogiFlow" };

export default function ImpressumPage() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 px-4 py-10">
      <main className="max-w-2xl mx-auto bg-white border border-slate-200 rounded-2xl p-6 sm:p-10 space-y-6 text-sm leading-relaxed">
        <Link href="/login" className="text-xs text-blue-600 hover:underline">
          Zurück zum Login
        </Link>
        <h1 className="text-2xl font-extrabold text-slate-900">Impressum</h1>

        <section className="space-y-1">
          <h2 className="font-bold text-slate-900">Anbieter (Angaben gemäß § 5 DDG)</h2>
          <p>Yazan Moussa</p>
          <p>Einzelunternehmer</p>
          <p>Friedrich-Alfred-Str. 158</p>
          <p>47226 Duisburg</p>
          <p>Deutschland</p>
        </section>

        <section className="space-y-1">
          <h2 className="font-bold text-slate-900">Kontakt</h2>
          <p>
            E-Mail:{" "}
            <a href="mailto:info@yazan-tech.com" className="text-blue-600 hover:underline">
              info@yazan-tech.com
            </a>
          </p>
        </section>

        <section className="space-y-1">
          <h2 className="font-bold text-slate-900">Umsatzsteuer</h2>
          <p>
            Kleinunternehmer im Sinne von § 19 UStG. Es wird keine Umsatzsteuer ausgewiesen.
            Eine Umsatzsteuer-Identifikationsnummer liegt derzeit nicht vor.
          </p>
        </section>

        <section className="space-y-1">
          <h2 className="font-bold text-slate-900">Verantwortlich für Inhalte (§ 18 Abs. 2 MStV)</h2>
          <p>Yazan Moussa, Anschrift wie oben.</p>
        </section>

        <section className="space-y-1">
          <h2 className="font-bold text-slate-900">Hinweis zur Nutzung</h2>
          <p>
            LogiFlow ist eine Software zur Lagerverwaltung und Einsatzplanung, die Unternehmen
            gegen Entgelt nutzen können. Für die Daten der Mitarbeitenden eines Kunden ist in der
            Regel der jeweilige Kunde verantwortlich, siehe{" "}
            <Link href="/datenschutz" className="text-blue-600 hover:underline">
              Datenschutzerklärung
            </Link>
            .
          </p>
        </section>
      </main>
    </div>
  );
}
