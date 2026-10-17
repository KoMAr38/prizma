// Schema-validates every XML part of an OOXML package with the ECMA-376 schemas compiled into Apache POI.
// Markup-compatibility blocks are resolved to their Fallback first, the way PowerPoint 2007 would read them.
import org.apache.xmlbeans.*;
import org.w3c.dom.*;
import javax.xml.parsers.*;
import javax.xml.transform.*;
import javax.xml.transform.dom.*;
import javax.xml.transform.stream.*;
import java.io.*;
import java.util.*;
import java.util.zip.*;

public class Validate {
  static final String MC = "http://schemas.openxmlformats.org/markup-compatibility/2006";

  static void resolveMce (Document doc) {
    NodeList list = doc.getElementsByTagNameNS(MC, "AlternateContent");
    List<Element> blocks = new ArrayList<>();
    for (int i = 0; i < list.getLength(); i++) blocks.add((Element) list.item(i));
    Collections.reverse(blocks); // innermost first
    for (Element ac : blocks) {
      Node parent = ac.getParentNode();
      if (parent == null) continue;
      Element fb = null;
      for (Node n = ac.getFirstChild(); n != null; n = n.getNextSibling())
        if (n instanceof Element && "Fallback".equals(n.getLocalName()) && MC.equals(n.getNamespaceURI())) fb = (Element) n;
      if (fb != null) while (fb.getFirstChild() != null) parent.insertBefore(fb.getFirstChild(), ac);
      parent.removeChild(ac);
    }
    Element root = doc.getDocumentElement();
    root.removeAttributeNS(MC, "Ignorable");
  }

  public static void main (String[] args) throws Exception {
    DocumentBuilderFactory f = DocumentBuilderFactory.newInstance();
    f.setNamespaceAware(true);
    Transformer t = TransformerFactory.newInstance().newTransformer();
    int bad = 0, checked = 0, untyped = 0;
    SchemaTypeSystem sts = (SchemaTypeSystem) Class.forName("org.apache.poi.schemas.ooxml.system.ooxml.TypeSystemHolder").getField("typeSystem").get(null);
    SchemaTypeLoader loader = XmlBeans.typeLoaderUnion(sts, XmlBeans.getBuiltinTypeSystem());
    try (ZipFile z = new ZipFile(args[0])) {
      for (ZipEntry e : Collections.list(z.entries())) {
        String n = e.getName();
        if (!n.endsWith(".xml") && !n.endsWith(".rels")) continue;
        Document doc = f.newDocumentBuilder().parse(z.getInputStream(e));
        resolveMce(doc);
        StringWriter sw = new StringWriter();
        t.transform(new DOMSource(doc), new StreamResult(sw));
        XmlOptions po = new XmlOptions();
        po.setLoadLineNumbers();
        XmlObject x = loader.parse(sw.toString(), null, po);
        SchemaType st = x.schemaType();
        if (st == null || st.isNoType() || st == XmlObject.type || st.getName() == null && st.getDocumentElementName() == null) {
          untyped++;
          System.out.println("?  " + n + " (no schema for " + doc.getDocumentElement().getNamespaceURI() + " " + doc.getDocumentElement().getLocalName() + ")");
          continue;
        }
        checked++;
        List<XmlError> errs = new ArrayList<>();
        XmlOptions vo = new XmlOptions();
        vo.setErrorListener(errs);
        // PowerPoint writes bullet sizes as 1/1000 percent ("80000"); POI's newer schema edition only takes "80%"
        if (!x.validate(vo) && errs.removeIf(er -> er.getMessage().contains("ST_TextBulletSizePercent")) | true && !errs.isEmpty()) {
          bad++;
          System.out.println("X  " + n);
          int k = 0;
          for (XmlError er : errs) { if (k++ >= 12) { System.out.println("     ... " + (errs.size() - 12) + " more"); break; } System.out.println("     " + er.getMessage()); }
        }
      }
    }
    System.out.println("checked " + checked + ", invalid " + bad + ", without schema " + untyped);
  }
}
