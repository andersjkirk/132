/* Friplanner price helper — a Cloudflare Worker.
 *
 * This tiny "server" fetches live flight + hotel prices from Travelpayouts
 * (which browsers are not allowed to call directly) and returns them to the
 * site with CORS enabled. The API token lives here, server-side, so it is not
 * exposed to visitors.
 *
 * Deploy: cloudflare.com → Workers & Pages → Create Worker → paste this →
 * Deploy. Then give the worker URL (xxx.workers.dev) to the site.
 *
 * Query params:
 *   origin   IATA of departure airport (default BLL = Billund)
 *   dest     IATA of destination airport (for flight price)
 *   loc      city name (for hotel price, e.g. "Barcelona")
 *   checkIn  YYYY-MM-DD
 *   checkOut YYYY-MM-DD
 * Returns: { "flight": <number|null>, "hotel": <number|null> }  (DKK)
 */

const TOKEN = "6fed067e5436be71b702861a2cdde247";

export default {
  async fetch(request) {
    const cors = {
      "Access-Control-Allow-Origin": "*",
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=3600",
    };
    if (request.method === "OPTIONS") return new Response(null, { headers: cors });

    const p = new URL(request.url).searchParams;
    const origin = p.get("origin") || "BLL";
    const dest = p.get("dest");
    const loc = p.get("loc");
    const checkIn = p.get("checkIn");
    const checkOut = p.get("checkOut");

    let flight = null;
    let hotel = null;

    // cheapest round-trip flight
    try {
      if (dest && checkIn) {
        const u =
          `https://api.travelpayouts.com/aviasales/v3/prices_for_dates?origin=${origin}` +
          `&destination=${dest}&departure_at=${checkIn}&return_at=${checkOut}` +
          `&currency=dkk&token=${TOKEN}&one_way=false&sorting=price&limit=1`;
        const r = await fetch(u);
        const d = await r.json();
        if (d && Array.isArray(d.data) && d.data.length) flight = d.data[0].price;
      }
    } catch (e) {}

    // cheapest hotel for the stay
    try {
      if (loc && checkIn && checkOut) {
        const u =
          `https://engine.hotellook.com/api/v2/cache.json?location=${encodeURIComponent(loc)}` +
          `&checkIn=${checkIn}&checkOut=${checkOut}&currency=dkk&limit=1&token=${TOKEN}`;
        const r = await fetch(u);
        const d = await r.json();
        if (Array.isArray(d) && d.length) hotel = d[0].priceFrom;
      }
    } catch (e) {}

    return new Response(JSON.stringify({ flight, hotel }), { headers: cors });
  },
};
