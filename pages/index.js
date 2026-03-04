import Link from "next/link";

export default function HomePage() {
  return (
    <main style={{
      minHeight: "100vh",
      fontFamily: "system-ui, sans-serif",
      background: "#f8fafc"
    }}>

      {/* HEADER */}

      <header style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "20px 40px",
        background: "#ffffff",
        borderBottom: "1px solid #e5e7eb"
      }}>
        <div style={{fontWeight:700,fontSize:20}}>
          SkipLogic
        </div>

        <div style={{display:"flex",gap:20}}>
          <Link href="/signin">Sign in</Link>

          <Link href="/signup">
            <button style={{
              background:"#1677ff",
              color:"#fff",
              border:"none",
              padding:"10px 16px",
              borderRadius:8,
              fontWeight:600,
              cursor:"pointer"
            }}>
              Start free trial
            </button>
          </Link>
        </div>
      </header>

      {/* HERO */}

      <section style={{
        maxWidth:900,
        margin:"80px auto",
        textAlign:"center",
        padding:"0 20px"
      }}>

        <h1 style={{
          fontSize:44,
          fontWeight:800,
          marginBottom:20
        }}>
          Skip Hire Software Built For Operators
        </h1>

        <p style={{
          fontSize:20,
          color:"#555",
          marginBottom:40,
          lineHeight:1.5
        }}>
          Manage bookings, vehicles, drivers, invoicing and compliance
          in one system built specifically for UK skip companies.
        </p>

        <Link href="/signup">
          <button style={{
            background:"#1677ff",
            color:"#fff",
            border:"none",
            padding:"16px 28px",
            borderRadius:10,
            fontSize:18,
            fontWeight:700,
            cursor:"pointer"
          }}>
            Start 30-day free trial
          </button>
        </Link>

        <p style={{
          marginTop:15,
          color:"#777"
        }}>
          No contract • Cancel anytime
        </p>

      </section>

      {/* FEATURES */}

      <section style={{
        maxWidth:1100,
        margin:"60px auto",
        display:"grid",
        gridTemplateColumns:"repeat(auto-fit,minmax(240px,1fr))",
        gap:30,
        padding:"0 20px"
      }}>

        {[
          {
            title:"Job Booking",
            text:"Create skip jobs in seconds with postcode pricing and instant scheduling."
          },
          {
            title:"Driver Runs",
            text:"Automatic route planning and driver job lists."
          },
          {
            title:"Customer Management",
            text:"Track builders, account customers and domestic bookings."
          },
          {
            title:"Xero Integration",
            text:"Automatically generate invoices and keep accounts up to date."
          }
        ].map((f)=>(
          <div key={f.title} style={{
            background:"#fff",
            padding:24,
            borderRadius:12,
            border:"1px solid #e5e7eb"
          }}>
            <h3 style={{marginBottom:10}}>{f.title}</h3>
            <p style={{color:"#555"}}>{f.text}</p>
          </div>
        ))}

      </section>

      {/* CTA */}

      <section style={{
        textAlign:"center",
        margin:"80px auto"
      }}>

        <h2 style={{fontSize:32,marginBottom:20}}>
          Ready to run a better skip business?
        </h2>

        <Link href="/signup">
          <button style={{
            background:"#1677ff",
            color:"#fff",
            border:"none",
            padding:"14px 24px",
            borderRadius:10,
            fontSize:18,
            fontWeight:700,
            cursor:"pointer"
          }}>
            Start your free trial
          </button>
        </Link>

      </section>

    </main>
  );
}
