"use client";
import Link from "next/link";
import {usePathname} from "next/navigation";

const links=[["/rails","Rails"],["/receipts","Receipts"],["/about","About"]];
export function Shell({children}:{children:React.ReactNode}){
 const path=usePathname();
 if(path==="/"||path==="/demo") return <>{children}</>;
 const nav=links.map(([href,label])=><Link key={href} href={href} className={path===href?"active":undefined} aria-current={path===href?"page":undefined}>{label}</Link>);
 return <div className="reference-home app-home">
  <header className="ref-nav"><div className="ref-wrap ref-nav-in">
   <Link className="ref-brand" href="/" aria-label="Rails Desk"><img src="/rails-desk-mark.svg" alt="Rails Desk"/></Link>
   <nav className="ref-links" aria-label="App">{nav}</nav>
   <Link className="ref-btn ref-primary ref-nav-btn" href="/demo">Play the demo</Link>
  </div>
  <nav className="app-subnav" aria-label="App (mobile)"><div className="ref-wrap">{nav}</div></nav>
  </header>
  <main className="main"><div className="content">{children}</div></main>
  <footer className="ref-foot"><div className="ref-wrap"><Link className="ref-brand" href="/" aria-label="Rails Desk"><img src="/rails-desk-mark.svg" alt="Rails Desk"/></Link><nav>{links.map(([href,label])=><Link key={href} href={href}>{label}</Link>)}<Link href="/demo">Demo</Link></nav><span>© 2026 Rails Desk</span></div></footer>
 </div>
}
