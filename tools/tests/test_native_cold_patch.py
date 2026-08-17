from __future__ import annotations

import unittest

from longview_tools.native_cold_patch import (
    ELEMENT_DECL_MARKER,
    IDL_MARKER,
    NODE_DECL_MARKER,
    _insert_class_public,
    _insert_idl,
    _node_impl,
)


class NativeColdPatchTest(unittest.TestCase):
    def test_node_implementation_uses_force_reattach_and_bool_detach(self) -> None:
        header = """
        class CORE_EXPORT Node {
         public:
          void SetForceReattachLayoutTree();
          void DetachLayoutTree(bool performing_reattach = false);
        };
        """
        implementation = _node_impl(header)
        self.assertIn("SetForceReattachLayoutTree();", implementation)
        self.assertIn("DetachLayoutTree(/*performing_reattach=*/true);", implementation)
        self.assertIn("LongViewCountInclusiveLayoutObjects", implementation)

    def test_node_implementation_supports_no_argument_detach(self) -> None:
        header = """
        class Node {
         public:
          void SetNeedsReattachLayoutTree();
          void DetachLayoutTree();
        };
        """
        implementation = _node_impl(header)
        self.assertIn("SetNeedsReattachLayoutTree();", implementation)
        self.assertIn("DetachLayoutTree();", implementation)

    def test_public_declaration_insertion_is_idempotent(self) -> None:
        source = "class CORE_EXPORT Element : public Node {\n public:\n  void existing();\n};\n"
        block = f"\n  // {ELEMENT_DECL_MARKER}\n  void native();\n"
        once = _insert_class_public(
            source,
            r"class\s+(?:CORE_EXPORT\s+)?Element\b[^\{]*\{",
            block,
            ELEMENT_DECL_MARKER,
        )
        twice = _insert_class_public(
            once,
            r"class\s+(?:CORE_EXPORT\s+)?Element\b[^\{]*\{",
            block,
            ELEMENT_DECL_MARKER,
        )
        self.assertEqual(once, twice)
        self.assertIn("void native();", once)

    def test_element_idl_insertion_is_idempotent(self) -> None:
        source = "interface Element : Node {\n    attribute DOMString id;\n};\n"
        once = _insert_idl(source)
        twice = _insert_idl(once)
        self.assertEqual(once, twice)
        self.assertIn(IDL_MARKER, once)
        self.assertIn("longViewDetachDescendantLayoutObjects", once)

    def test_markers_remain_distinct(self) -> None:
        self.assertNotEqual(NODE_DECL_MARKER, ELEMENT_DECL_MARKER)


if __name__ == "__main__":
    unittest.main()
