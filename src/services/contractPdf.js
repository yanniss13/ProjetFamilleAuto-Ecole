// Génération du PDF de contrat (pdfkit). Le modèle (intitulé + dénomination des parties
// + articles) est choisi selon le type de contrat. Les modèles sont INDICATIFS et portent
// un avertissement : ils doivent être validés juridiquement avant signature.
const PDFDocument = require('pdfkit');

const TYPE_LABEL = {
  freelance: 'Contrat de prestation de services',
  cdi: 'Contrat de travail à durée indéterminée (CDI)',
  cdd: 'Contrat de travail à durée déterminée (CDD)',
  apprentissage: "Contrat d'apprentissage",
  generic: 'Contrat',
};

// Dénomination des deux parties selon le type.
const PARTIES = {
  freelance: { a: 'Le Client', b: 'Le Prestataire' },
  cdi: { a: "L'Employeur", b: 'Le Salarié' },
  cdd: { a: "L'Employeur", b: 'Le Salarié' },
  apprentissage: { a: "L'Employeur", b: "L'Apprenti(e)" },
  generic: { a: 'Partie A (auto-école)', b: 'Partie B (intervenant)' },
};

function fmtDate(d) {
  if (!d) return '—';
  const date = d instanceof Date ? d : new Date(d);
  return date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' });
}

// Construit le PDF et le résout en Buffer (réutilisable pour disque + pièce jointe email).
function buildContractPdf({ type, school, applicant, listing, terms }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 56 });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const label = TYPE_LABEL[type] || TYPE_LABEL.generic;
    const parties = PARTIES[type] || PARTIES.generic;

    const article = (n, title, body) => {
      doc.moveDown(0.6);
      doc.font('Helvetica-Bold').fontSize(11).text(`Article ${n} — ${title}`);
      doc.font('Helvetica').fontSize(10).text(body, { align: 'justify' });
    };

    // En-tête
    doc.font('Helvetica-Bold').fontSize(16).text(label, { align: 'center' });
    doc.moveDown(0.2);
    doc.font('Helvetica').fontSize(9).fillColor('#555')
      .text(`Référence annonce : ${listing.title}`, { align: 'center' })
      .fillColor('#000');

    // Parties
    doc.moveDown(1);
    doc.font('Helvetica-Bold').fontSize(11).text('Entre les soussignés :');
    doc.moveDown(0.4);
    doc.font('Helvetica-Bold').fontSize(10).text(`${parties.a} :`);
    doc.font('Helvetica').fontSize(10).text(
      [
        school.businessName,
        `SIRET : ${school.siret}`,
        terms.schoolAddress ? `Adresse : ${terms.schoolAddress}` : null,
        school.phone ? `Téléphone : ${school.phone}` : null,
        `Email : ${school.email}`,
      ].filter(Boolean).join('\n')
    );

    doc.moveDown(0.5);
    doc.font('Helvetica-Bold').fontSize(10).text(`${parties.b} :`);
    const birthLine =
      terms.birthDate || terms.birthPlace
        ? `Né(e)${terms.birthDate ? ` le ${fmtDate(terms.birthDate)}` : ''}${terms.birthPlace ? ` à ${terms.birthPlace}` : ''}`
        : null;
    doc.font('Helvetica').fontSize(10).text(
      [
        applicant.applicantName,
        birthLine,
        terms.nationality ? `Nationalité : ${terms.nationality}` : null,
        terms.applicantAddress ? `Adresse : ${terms.applicantAddress}` : null,
        applicant.applicantPhone ? `Téléphone : ${applicant.applicantPhone}` : null,
        `Email : ${applicant.applicantEmail}`,
        type === 'freelance' && terms.providerSiret ? `SIRET : ${terms.providerSiret}` : null,
      ].filter(Boolean).join('\n')
    );

    doc.moveDown(0.8);
    doc.font('Helvetica-Bold').fontSize(11).text('Il a été convenu ce qui suit :');

    // Articles
    const objet =
      type === 'freelance'
        ? `Le Prestataire réalise pour le compte du Client une mission d'enseignement de la conduite : « ${listing.title} », à ${listing.city} (${listing.department}).`
        : `${parties.b} occupe le poste lié à l'annonce « ${listing.title} », à ${listing.city} (${listing.department}).`;
    article(1, 'Objet', objet);

    if (type === 'cdd') {
      article(2, 'Durée', `Le présent contrat est conclu pour une durée déterminée, du ${fmtDate(terms.startDate)} au ${fmtDate(terms.endDate)}.\nMotif de recours : ${terms.motif || '—'}.`);
    } else if (type === 'freelance') {
      article(2, 'Date de début de mission', `La mission débute le ${fmtDate(terms.startDate)}.`);
    } else {
      article(2, 'Date de prise de fonction', `La prise de fonction est fixée au ${fmtDate(terms.startDate)}.`);
    }

    article(3, 'Lieu', `Le lieu d'exécution est : ${terms.workplace}.`);

    if (terms.weeklyHours) {
      article(4, 'Durée du travail', `La durée hebdomadaire est de ${terms.weeklyHours} heures.`);
    }

    article(
      terms.weeklyHours ? 5 : 4,
      type === 'freelance' ? 'Rémunération de la prestation' : 'Rémunération',
      `${terms.grossSalary}.`
    );

    let next = terms.weeklyHours ? 6 : 5;

    const quals = [];
    if (terms.teachingAuthNumber) {
      quals.push(
        `Autorisation d'enseigner la conduite n° ${terms.teachingAuthNumber}` +
        (terms.teachingAuthValidUntil ? `, valable jusqu'au ${fmtDate(terms.teachingAuthValidUntil)}` : '') +
        '.'
      );
    }
    if (terms.licenseNumber) {
      quals.push(
        `Permis de conduire n° ${terms.licenseNumber}` +
        (terms.licenseCategories ? ` (catégories : ${terms.licenseCategories})` : '') +
        '.'
      );
    }
    if (quals.length) {
      article(next, 'Qualifications', quals.join('\n'));
      next += 1;
    }

    if (terms.trialPeriodWeeks && type !== 'freelance') {
      article(next, "Période d'essai", `Le contrat comporte une période d'essai de ${terms.trialPeriodWeeks} semaine(s).`);
      next += 1;
    }
    if (terms.extraClauses) {
      article(next, 'Clauses particulières', terms.extraClauses);
      next += 1;
    }

    if (type === 'apprentissage') {
      doc.moveDown(0.6);
      doc.font('Helvetica-Oblique').fontSize(9).fillColor('#8a4b00').text(
        "Note : le contrat d'apprentissage relève d'un formulaire CERFA officiel (n° 10103). " +
        'Ce document est une lettre d\'engagement indicative ; le CERFA officiel doit être complété et déposé séparément.',
        { align: 'justify' }
      ).fillColor('#000');
    }

    // Signatures
    doc.moveDown(1.2);
    doc.font('Helvetica').fontSize(10).text('Fait à ____________________, le ____________________, en deux exemplaires originaux.');
    doc.moveDown(1.5);
    const y = doc.y;
    doc.fontSize(10).text(`${parties.a}`, 56, y);
    doc.text(`${parties.b}`, 320, y);
    doc.moveDown(0.3);
    doc.fontSize(8).fillColor('#777')
      .text('(signature précédée de « Lu et approuvé »)', 56, doc.y)
      .text('(signature précédée de « Lu et approuvé »)', 320, doc.y)
      .fillColor('#000');

    // Avertissement
    doc.moveDown(2);
    doc.font('Helvetica-Oblique').fontSize(8).fillColor('#999').text(
      'Modèle indicatif généré par MoniteurConnect — à faire vérifier et valider juridiquement avant toute signature. ' +
      'MoniteurConnect décline toute responsabilité quant à la conformité légale de ce document.',
      { align: 'center' }
    ).fillColor('#000');

    doc.end();
  });
}

module.exports = { buildContractPdf, TYPE_LABEL };
