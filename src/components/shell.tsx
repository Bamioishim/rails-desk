"use client";
import Link from "next/link";
import {usePathname} from "next/navigation";

const links=[["/propose","Overview"],["/rails","Rails"],["/receipts","Receipts"],["/about","About"]];
export function Shell({children}:{children:React.ReactNode}){
 const path=usePathname();
 return <div className="site-shell">
  <div className="announcement"><span>RAILS DESK</span><span className="announcement-copy">A clear control layer for agent actions</span><span className="announcement-dot"/></div>
  <header className="site-header">
   <Link href="/propose" className="brand"><img className="brand-mark-image" src="/rails-desk-mark.svg" alt="" aria-hidden="true"/><span className="brand-word">rails desk</span></Link>
   <nav className="main-nav">{links.map(([href,label])=><Link key={href} href={href} className={path===href?"nav-link active":"nav-link"}>{label}</Link>)}</nav>
   <div className="header-actions"><span className="local-status"><i/> Local demo</span><Link href="/demo" className="button button-small">Play the demo <span>↗</span></Link></div>
  </header>
  <main className="main"><div className="content">{children}</div></main>
  <footer className="site-footer"><div className="footer-top"><Link href="/propose" className="brand footer-brand"><span className="brand-mark">r.</span><span className="brand-word">rails desk</span></Link><p>Let agents do the work.<br/>Keep the boundaries yours.</p><div className="footer-links">{links.map(([href,label])=><Link key={href} href={href}>{label}</Link>)}<Link href="/demo">Play the demo</Link></div></div><div className="footer-bottom"><span>LOCAL DEMO · V0.1</span><span>Proposals are simulated. No funds move.</span><span>Built for clearer agent oversight.</span></div></footer>
 </div>
}
