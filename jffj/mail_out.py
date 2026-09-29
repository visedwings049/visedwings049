"""Outgoing email (send a finished card to yourself). Gmail only - config comes from .env."""
import os
import re
import smtplib
from email.mime.image import MIMEImage
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def smtp_configured() -> bool:
    return bool(os.environ.get("JFFJ_SMTP_USER") and os.environ.get("JFFJ_SMTP_PASSWORD"))


def _connect() -> smtplib.SMTP:
    user = os.environ.get("JFFJ_SMTP_USER")
    password = os.environ.get("JFFJ_SMTP_PASSWORD")
    if not user or not password:
        raise RuntimeError("Email isn't configured. Fill in the app password in Settings.")
    host = os.environ.get("JFFJ_SMTP_HOST", "smtp.gmail.com")
    port_raw = os.environ.get("JFFJ_SMTP_PORT", "587")
    port = int(port_raw) if port_raw.isdigit() else 587
    use_tls = os.environ.get("JFFJ_SMTP_USE_TLS", "true").lower() == "true"

    server = smtplib.SMTP(host, port, timeout=30)
    if use_tls:
        server.starttls()
    server.login(user, password)
    return server


def test_login() -> str:
    """Try logging into SMTP with the current settings. Returns a human-readable result."""
    user = os.environ.get("JFFJ_SMTP_USER")
    if not user:
        return "Enter your email address first."
    try:
        server = _connect()
        try:
            pass
        finally:
            server.quit()
        return f"Success — logged in as {user}."
    except RuntimeError as exc:
        return str(exc)
    except smtplib.SMTPException as exc:
        return f"Login rejected: {exc}\nCheck the app password (not your normal password) and that IMAP/SMTP is enabled."
    except Exception as exc:
        return f"Could not reach the mail server: {exc}"


def send_card_email(to_address: str, subject: str, body: str, image_bytes: bytes, image_filename: str) -> None:
    user = os.environ.get("JFFJ_SMTP_USER")
    sender = os.environ.get("JFFJ_EMAIL_FROM") or user

    msg = MIMEMultipart()
    msg["From"] = sender
    msg["To"] = to_address
    msg["Subject"] = subject
    msg.attach(MIMEText(body, "plain"))
    image_part = MIMEImage(image_bytes, name=image_filename)
    image_part.add_header("Content-Disposition", "attachment", filename=image_filename)
    msg.attach(image_part)

    server = _connect()
    try:
        server.sendmail(sender, [to_address], msg.as_string())
    finally:
        server.quit()
