export const FLOW = {
  en: {
    title: "How ReLoop works",
    steps: [
      ["Book", "Customer (Public / Corporate) opens Sell Your Scrap, picks material, enters weight, district, address and uploads scrap photos. Earnings are calculated instantly. Order is created as Pending."],
      ["Dispatch", "Open mode (default): every verified delivery partner sees Pending orders and the first to tap Accept Order gets it. Admin-assign mode: only admin assigns orders to a verified partner. Admin can assign or reassign in both modes."],
      ["Verify partner", "A delivery partner must upload driving licence, photo, live selfie, licence number and vehicle number. The district admin reviews and approves. Only verified partners can accept or update pickups."],
      ["Pickup", "Partner moves the order to In Progress when leaving, collects and weighs the scrap, then marks Completed. The amount is counted as settled."],
      ["Track", "Customer sees every step live in the Pickup Timeline: who accepted, partner name, vehicle number, phone and time of each change."],
      ["Monitor", "Admins and partners monitor zones, revenue, compliance (CO₂ saved) and export any table to CSV."],
    ],
  },
  ta: {
    title: "ReLoop எப்படி வேலை செய்கிறது",
    steps: [
      ["பதிவு", "வாடிக்கையாளர் (பொது / நிறுவனம்) 'Sell Your Scrap' பக்கத்தில் பொருள் வகை, எடை, மாவட்டம், முகவரி தேர்வு செய்து ஸ்கிராப் புகைப்படங்களை பதிவேற்றுகிறார். வருமானம் உடனே கணக்கிடப்படும். ஆர்டர் 'Pending' நிலையில் உருவாகும்."],
      ["ஒதுக்கீடு", "Open முறை (இயல்பு): சரிபார்க்கப்பட்ட அனைத்து டெலிவரி பார்ட்னர்களுக்கும் Pending ஆர்டர்கள் தெரியும்; முதலில் 'Accept Order' அழுத்துபவருக்கு ஆர்டர் கிடைக்கும். Admin-assign முறை: அட்மின் மட்டுமே சரிபார்க்கப்பட்ட பார்ட்னருக்கு ஒதுக்குவார். இரண்டு முறையிலும் அட்மின் மாற்றி ஒதுக்கலாம்."],
      ["பார்ட்னர் சரிபார்ப்பு", "டெலிவரி பார்ட்னர் ஓட்டுநர் உரிமம், புகைப்படம், நேரடி செல்ஃபி, உரிம எண் மற்றும் வாகன எண்ணை பதிவேற்ற வேண்டும். மாவட்ட அட்மின் சரிபார்த்து ஒப்புதல் அளிப்பார். சரிபார்க்கப்பட்ட பார்ட்னர் மட்டுமே பிக்கப் எடுக்க முடியும்."],
      ["பிக்கப்", "பார்ட்னர் புறப்படும்போது 'In Progress' ஆக மாற்றி, ஸ்கிராப்பை எடை போட்டு சேகரித்த பின் 'Completed' என குறிப்பார். தொகை செட்டில் செய்யப்பட்டதாக கணக்கிடப்படும்."],
      ["கண்காணிப்பு", "வாடிக்கையாளர் 'Pickup Timeline'-ல் ஒவ்வொரு நிலையையும் நேரலையில் பார்க்கலாம்: யார் ஏற்றார், பார்ட்னர் பெயர், வாகன எண், தொலைபேசி, நேரம்."],
      ["மேலாண்மை", "அட்மின் மற்றும் பார்ட்னர்கள் மண்டலங்கள், வருவாய், இணக்க அறிக்கைகள் (CO₂ சேமிப்பு) பார்த்து எந்த அட்டவணையையும் CSV ஆக பதிவிறக்கலாம்."],
    ],
  },
};

export const GUIDES = {
  public: {
    en: { title: "Public User", steps: ["Log in with role 'Public User', your email and password.", "Open Sell Your Scrap: choose material, enter weight (Kg or Tons), district, address, phone and preferred date.", "Add up to 5 photos of your scrap, check the estimated earnings and tap Request Pickup.", "Open My Pickups and tap Track on any order to see the live timeline, partner name and vehicle number.", "You can cancel an order while it is still Pending.", "Use search, From/To dates and pages to find old orders; Export CSV to download.", "Update your name, phone and default address in Profile."] },
    ta: { title: "பொது பயனர்", steps: ["'Public User' பாத்திரம், உங்கள் மின்னஞ்சல், கடவுச்சொல் மூலம் உள்நுழையவும்.", "'Sell Your Scrap' திறந்து பொருள் வகை, எடை (Kg/Tons), மாவட்டம், முகவரி, தொலைபேசி, விருப்ப தேதியை உள்ளிடவும்.", "அதிகபட்சம் 5 ஸ்கிராப் புகைப்படங்களை சேர்த்து, மதிப்பிடப்பட்ட வருமானத்தை பார்த்து 'Request Pickup' அழுத்தவும்.", "'My Pickups'-ல் 'Track' அழுத்தி நேரலை டைம்லைன், பார்ட்னர் பெயர், வாகன எண் பார்க்கவும்.", "Pending நிலையில் இருக்கும் வரை ஆர்டரை ரத்து செய்யலாம்.", "தேடல், தொடக்க/முடிவு தேதி, பக்கங்கள் மூலம் பழைய ஆர்டர்களை கண்டறியலாம்; 'Export CSV' மூலம் பதிவிறக்கலாம்.", "'Profile'-ல் பெயர், தொலைபேசி, முகவரியை புதுப்பிக்கலாம்."] },
  },
  corporate: {
    en: { title: "Corporate Client", steps: ["Log in with role 'Corporate Client'.", "Use Sell Your Scrap for bulk pickups — switch the unit to Tons for large loads and attach photos.", "Track each order in My Pickups with the step-by-step timeline.", "Open Compliance & ESG to see kg diverted, CO₂ saved, monthly summary and recycling certificates.", "Export any report to CSV for audits.", "Keep your organisation details updated in Profile."] },
    ta: { title: "நிறுவன வாடிக்கையாளர்", steps: ["'Corporate Client' பாத்திரத்தில் உள்நுழையவும்.", "பெரிய அளவு ஸ்கிராப்புக்கு 'Sell Your Scrap'-ல் அலகை Tons ஆக மாற்றி புகைப்படங்களை இணைக்கவும்.", "'My Pickups'-ல் ஒவ்வொரு ஆர்டரின் படிப்படியான டைம்லைனை கண்காணிக்கவும்.", "'Compliance & ESG'-ல் மறுசுழற்சி செய்த கிலோ, CO₂ சேமிப்பு, மாதாந்திர சுருக்கம், சான்றிதழ்கள் பார்க்கவும்.", "தணிக்கைக்காக எந்த அறிக்கையையும் CSV ஆக பதிவிறக்கவும்.", "'Profile'-ல் நிறுவன விவரங்களை புதுப்பிக்கவும்."] },
  },
  delivery_partner: {
    en: { title: "Delivery Partner", steps: ["Log in with role 'Delivery Partner'.", "Open Verification: select your district, enter mobile, vehicle type, vehicle number and licence number.", "Upload your driving licence, a passport photo and take a live selfie, then Submit for Verification.", "Wait for the district admin to approve. Until then you can view orders but cannot accept them.", "After approval, open All Pickups and tap Accept Order on a Pending order (or wait for admin to assign you).", "In My Assignments, change status to In Progress when leaving and Completed after collecting and weighing.", "Use search, dates and pages to find orders; Export CSV for your records."] },
    ta: { title: "டெலிவரி பார்ட்னர்", steps: ["'Delivery Partner' பாத்திரத்தில் உள்நுழையவும்.", "'Verification' திறந்து மாவட்டம், மொபைல் எண், வாகன வகை, வாகன எண், உரிம எண்ணை உள்ளிடவும்.", "ஓட்டுநர் உரிமம், பாஸ்போர்ட் புகைப்படம் பதிவேற்றி, நேரடி செல்ஃபி எடுத்து 'Submit for Verification' அழுத்தவும்.", "மாவட்ட அட்மின் ஒப்புதல் அளிக்கும் வரை காத்திருக்கவும். அதுவரை ஆர்டர்களை பார்க்கலாம், ஏற்க முடியாது.", "ஒப்புதலுக்குப் பின் 'All Pickups'-ல் Pending ஆர்டரில் 'Accept Order' அழுத்தவும் (அல்லது அட்மின் ஒதுக்கும் வரை காத்திருக்கவும்).", "'My Assignments'-ல் புறப்படும்போது 'In Progress', சேகரித்து எடை போட்ட பின் 'Completed' என மாற்றவும்.", "தேடல், தேதி, பக்கங்கள் மூலம் ஆர்டர்களை கண்டறிந்து CSV பதிவிறக்கலாம்."] },
  },
  partner: {
    en: { title: "Business Partner (Hub)", steps: ["Log in with role 'Business Partner'.", "Overview shows active zones, pickups mapped, total volume and hub status.", "Open Area Management to add, edit or delete zones with city, hub, households, daily volume and status.", "All Pickups shows every order for planning (read-only).", "Search, filter by dates, page through records and export CSV."] },
    ta: { title: "வணிக பார்ட்னர் (ஹப்)", steps: ["'Business Partner' பாத்திரத்தில் உள்நுழையவும்.", "Overview-ல் செயலில் உள்ள மண்டலங்கள், பிக்கப்கள், மொத்த அளவு, ஹப் நிலை தெரியும்.", "'Area Management'-ல் நகரம், ஹப், வீடுகள், தினசரி அளவு, நிலையுடன் மண்டலங்களை சேர்க்க/திருத்த/நீக்கலாம்.", "'All Pickups'-ல் திட்டமிடலுக்காக அனைத்து ஆர்டர்களையும் பார்க்கலாம்.", "தேடல், தேதி வடிகட்டி, பக்கங்கள், CSV பதிவிறக்கம் பயன்படுத்தலாம்."] },
  },
  admin: {
    en: { title: "Admin / District Admin", steps: ["Head admins (scope 'All') see every district; district admins see only their district.", "Partner Verification: review licence, photo and selfie of delivery partners, then Approve or Reject with a reason.", "All Pickups: change status or use the Assign dropdown to give an order to a verified partner.", "Users: add users (head admin can create district admins), change roles, activate/deactivate.", "Global Settings (head admin): price rates, minimum pickup weight, districts and dispatch mode (Open or Admin-assign).", "Compliance and Area Management for reports and zones; every table has search, date range, pages and CSV export."] },
    ta: { title: "அட்மின் / மாவட்ட அட்மின்", steps: ["தலைமை அட்மின் (scope 'All') அனைத்து மாவட்டங்களையும் பார்ப்பார்; மாவட்ட அட்மின் தனது மாவட்டத்தை மட்டும் பார்ப்பார்.", "'Partner Verification': டெலிவரி பார்ட்னரின் உரிமம், புகைப்படம், செல்ஃபி சரிபார்த்து ஒப்புதல் அல்லது காரணத்துடன் நிராகரிக்கவும்.", "'All Pickups': நிலையை மாற்றலாம் அல்லது 'Assign' மூலம் சரிபார்க்கப்பட்ட பார்ட்னருக்கு ஒதுக்கலாம்.", "'Users': பயனர்களை சேர்க்க (தலைமை அட்மின் மாவட்ட அட்மினை உருவாக்கலாம்), பாத்திரம் மாற்ற, செயல்படுத்த/நிறுத்தலாம்.", "'Global Settings' (தலைமை அட்மின்): விலை, குறைந்தபட்ச எடை, மாவட்டங்கள், ஒதுக்கீட்டு முறை (Open / Admin-assign).", "இணக்கம், மண்டல மேலாண்மை; ஒவ்வொரு அட்டவணையிலும் தேடல், தேதி வரம்பு, பக்கங்கள், CSV உள்ளது."] },
  },
};

export function manualText(lang) {
  const f = FLOW[lang];
  const lines = [`ReLoop — ${lang === "ta" ? "பயனர் கையேடு" : "User Manual"}`, "", f.title, ...f.steps.map(([t, d], i) => `${i + 1}. ${t}: ${d}`), ""];
  Object.values(GUIDES).forEach((g) => {
    lines.push(g[lang].title, ...g[lang].steps.map((s, i) => `  ${i + 1}. ${s}`), "");
  });
  return lines.join("\n");
}
