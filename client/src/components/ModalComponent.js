import React from "react";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import useMediaQuery from "@mui/material/useMediaQuery";
import { useTheme } from "@mui/material/styles";

/**
 * Generic confirmation modal built on MUI's Dialog, which handles the fade and
 * scale transition on open and close. Content-heavy modals go full screen on
 * phones so long forms are not squeezed into a small box.
 * @param {Object} props
 * @param {boolean} props.isOpen - Whether the modal is visible
 * @param {string} props.title - Modal title text
 * @param {React.ReactNode} props.children - Modal body content
 * @param {Function} [props.onConfirm] - Called when the confirm button is clicked
 * @param {Function} props.onCancel - Called when the cancel button or backdrop is clicked
 * @param {boolean} [props.hideConfirm] - Hides the confirm button, for content-only modals
 * @param {string} [props.cancelLabel] - Overrides the cancel button text
 * @param {boolean} [props.wide] - Widens the modal for longer content
 */
function ModalComponent({
  isOpen,
  title,
  children,
  onConfirm,
  onCancel,
  hideConfirm,
  cancelLabel = "Cancel",
  wide,
}) {
  const theme = useTheme();
  const isPhone = useMediaQuery(theme.breakpoints.down("sm"));

  return (
    <Dialog
      open={Boolean(isOpen)}
      onClose={onCancel}
      maxWidth={wide ? "md" : "xs"}
      fullWidth
      fullScreen={wide && isPhone}
      transitionDuration={220}
    >
      {title && (
        <DialogTitle sx={{ pb: 1, pr: 6, wordBreak: "break-word" }}>{title}</DialogTitle>
      )}
      <DialogContent dividers>{children}</DialogContent>
      <DialogActions>
        <Button onClick={onCancel} color="inherit">
          {cancelLabel}
        </Button>
        {!hideConfirm && (
          <Button onClick={onConfirm} variant="contained" color="error">
            Confirm
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}

export default ModalComponent;
