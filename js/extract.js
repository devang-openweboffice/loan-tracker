/* Photo → form extraction with Claude vision, plus local storage of the document photos (IndexedDB). */

const Extract = (() => {
  const MODEL = 'claude-opus-5';
  const SDK_URL = 'https://cdn.jsdelivr.net/npm/@anthropic-ai/sdk/+esm';
  let sdkPromise;
  const sdk = () => (sdkPromise = sdkPromise || import(SDK_URL).then(m => m.default));

  // Every value comes back as a string ("" when not visible); the form converts numbers itself.
  const STRING_FIELDS = [
    'applicantName', 'coApplicantName', 'coApplicantRelation', 'appId', 'oldAppId', 'salesManager', 'teamLeader', 'dsaName', 'branch',
    'pan', 'mobile', 'email', 'fileNo', 'loanAccountNo', 'leadId',
    'mainLoanType', 'mainLoanAmount', 'mainLoanTenure', 'mainLoanRate', 'propertyLocation',
    'sumAssured', 'actualSumAssured', 'coverTerm', 'coverType', 'rider', 'premiumFinanced', 'dob', 'age', 'gcppDate',
    'basicPremium', 'gst', 'totalPremium', 'masterPolicyNo',
    'subId', 'scheme', 'premiumTerm', 'gender', 'occupation', 'placeOfBirth', 'height', 'weight', 'smq',
    'nomineeName', 'nomineeRelation', 'nomineeMobile', 'address',
    'approvalNo', 'sanctionDate', 'propertyInsPremium', 'lifeInsPremium', 'healthInsPremium', 'insLoanAmount',
    'repoRate', 'spread', 'roi', 'installments', 'emi',
    'mainLoanLoginAt', 'formSignedDate', 'notes'
  ];

  const SCHEMA = {
    type: 'object',
    properties: Object.assign(
      Object.fromEntries(STRING_FIELDS.map(k => [k, { type: 'string' }])),
      {
        documentsFound: { type: 'array', items: { type: 'string' } },
        uncertainFields: { type: 'array', items: { type: 'string' } }
      }
    ),
    required: STRING_FIELDS.concat(['documentsFound', 'uncertainFields']),
    additionalProperties: false
  };

  const PROMPT = `These are photos of one Axis Bank loan file with Bajaj Life group credit insurance (GCPP), collected by a bancassurance sales relationship manager in India. A file usually contains:
1. Axis Bank "HOME LOAN" blue cover sheet (handwritten): Sales Manager, DSA name, Branch, Product, Applicant name, Co-applicant name, Loan amount (= the insurance loan amount), Interest rate, Tenure, "Old App ID" (main loan), a large handwritten number = the new App ID / FINNONE number, PAN written at the side, and sometimes a note like "Main loan login 23/09/26 3:50".
2. Axis "Insurance Sanction Letter" (printed): approval no. (IN_LNPINS_FLOATING_BRE / FINNONE_… / …), letter date, applicant name and address, REPO rate, Spread, REPO+Spread, Amount of loan, 1. Property insurance, 2. Life insurance, 3. Health insurance, EMI, No. of monthly installments, Name of co-applicant.
3. Bajaj "Member Enrollment Form" (handwritten): Sub ID, master policy number, scheme, Loan amount (= main loan), loan type (HL = Home Loan), loan tenure, interest, member rows (applicant, co-applicant) with place of birth, DOB, gender, relationship, occupation, address, mobile, email, nominee mobile, PAN, premium type, sum assured, term of cover, premium excl/incl GST, height, weight, medical questionnaire ticks, and a signature date.
4. Bajaj "GCPP Calculator" printout (may be photographed sideways): customer name, Sum Assured, Premium Financed, Term, DOB, DoD, Cover (Level/Reducing), MPH No, Product (Home Loan / LAP / ASHA), Rider (ACI), Actual Sum Assured, Age, Basic Premium, GST, Premium to be filled in App form.

Extract the fields for this one file. Rules:
- Use "" for anything not visible. Never guess. Put the name of any field you are unsure about (for example, hard-to-read handwriting) in uncertainFields.
- Amounts: digits only, no commas or ₹ (e.g. "189175"). Rates: plain number (e.g. "10.5"). Tenure and cover term in years; installments in months.
- Dates: YYYY-MM-DD. mainLoanLoginAt: YYYY-MM-DDTHH:MM (24h), taken from a "main loan login" note if present. The cover sheets use DD/MM/YY.
- appId = the large new App ID / FINNONE number (also found in the sanction approval no.). oldAppId = "Old App ID".
- insLoanAmount = the sanction letter's "Amount of loan" (or the cover sheet loan amount). mainLoanAmount = the main home loan / LAP amount on the enrollment form (usually lakhs).
- lifeInsPremium = sanction letter life insurance (usually equal to the GCPP premium incl. GST). totalPremium = GCPP "Premium to be filled in App form". basicPremium and gst from the GCPP calculator.
- mainLoanType: one of "Home Loan (HL)", "LAP", "ASHA", "Top-up", "Balance Transfer", "Other" (use the GCPP product; HL = Home Loan (HL)).
- gender: "M" or "F". coverType: "Level" or "Reducing". rider: "ACI", "APTD", "ACI + APTD" or "None". premiumTerm: "Single" or "Regular". premiumFinanced: "Yes" or "No".
- occupation: one of Salaried, Self-employed, Business, Professional, Housewife, Retired, Student, Other.
- smq: 'All answers "No"' if every medical question is ticked No, 'Has "Yes" answer(s)' if any is Yes, else "".
- coApplicantRelation: the co-applicant's relationship to the applicant (Wife, Husband, Mother, …).
- documentsFound: which of the 4 documents you saw. notes: anything else useful (e.g. a second handwritten date), in one short sentence.`;

  /* ---------- images ---------- */

  // Downscale to ≤1568px long edge (Claude's vision sweet spot) and re-encode as JPEG.
  async function prepare(file, maxEdge = 1568, quality = 0.85) {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, maxEdge / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    bmp.close && bmp.close();
    return { name: file.name, dataUrl: c.toDataURL('image/jpeg', quality) };
  }

  async function read(images, apiKey) {
    if (!apiKey) throw new Error('NO_KEY');
    const Anthropic = await sdk();
    const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
    const content = images.map(img => ({
      type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: img.dataUrl.split(',')[1] }
    }));
    content.push({ type: 'text', text: PROMPT });

    let response;
    try {
      response = await client.beta.messages.create({
        model: MODEL,
        max_tokens: 16000,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        output_config: { format: { type: 'json_schema', schema: SCHEMA } },
        messages: [{ role: 'user', content }]
      });
    } catch (err) {
      if (err instanceof Anthropic.AuthenticationError) throw new Error('The photo-reading key was rejected. Ask Devang to check it.');
      if (err instanceof Anthropic.PermissionDeniedError) throw new Error('The photo-reading key is not allowed to use the model. Ask Devang to check the Anthropic account.');
      if (err instanceof Anthropic.RateLimitError) throw new Error('Too many requests right now. Wait a minute and try again.');
      if (err instanceof Anthropic.BadRequestError) throw new Error('The request was rejected: ' + err.message);
      if (err instanceof Anthropic.APIConnectionError) throw new Error('Could not reach the Claude API. Check the internet connection.');
      if (err instanceof Anthropic.APIError) throw new Error(`Claude API error ${err.status}: ${err.message}`);
      throw err;
    }
    if (response.stop_reason === 'refusal') throw new Error('Claude declined to read these images. Please fill the form manually.');
    if (response.stop_reason === 'max_tokens') throw new Error('The reply was cut off. Try fewer photos at a time.');
    const text = response.content.filter(b => b.type === 'text').map(b => b.text).join('');
    try { return JSON.parse(text); } catch (e) { throw new Error('Could not understand the reply. Please try again.'); }
  }

  // Checks the key without using any tokens: just looks up the model.
  async function testKey(apiKey) {
    const Anthropic = await sdk();
    const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
    try { await client.models.retrieve(MODEL); }
    catch (err) {
      if (err instanceof Anthropic.AuthenticationError) throw new Error('Anthropic rejected this key. Check that it was copied completely.');
      if (err instanceof Anthropic.NotFoundError || err instanceof Anthropic.PermissionDeniedError) throw new Error('This key has no access to ' + MODEL + '. Check the account on console.anthropic.com.');
      if (err instanceof Anthropic.APIConnectionError) throw new Error('Could not reach Anthropic. Check the internet connection.');
      throw err;
    }
  }

  /* ---------- photo storage (IndexedDB — photos are too big for localStorage) ---------- */

  function db() {
    return new Promise((res, rej) => {
      const r = indexedDB.open('avani_docs', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('photos');
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    });
  }
  async function tx(mode, fn) {
    const d = await db();
    return new Promise((res, rej) => {
      const t = d.transaction('photos', mode); const req = fn(t.objectStore('photos'));
      t.oncomplete = () => res(req && req.result); t.onerror = () => rej(t.error);
    });
  }
  const photos = {
    get: id => tx('readonly', s => s.get(id)).then(v => v || []).catch(() => []),
    set: (id, list) => tx('readwrite', s => s.put(list, id)),
    remove: id => tx('readwrite', s => s.delete(id)).catch(() => {})
  };

  return { read, prepare, testKey, photos, MODEL };
})();
