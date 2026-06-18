"""Generate a self-signed cert for localhost + 127.0.0.1 + this machine's LAN IP,
so the backend can serve HTTPS (required for the phone mic). No mkcert needed.

    server\\.venv\\Scripts\\python.exe server\\make_cert.py

Writes server/certs/{cert.pem,key.pem,cert.der}. Trust cert.der on the laptop
(added to the user Root store by setup_certs); phones just proceed past the
"not private" warning once (that still gives a secure context for the mic).
"""
import datetime
import ipaddress
import os
import socket

from cryptography import x509
from cryptography.x509.oid import NameOID
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa


def lan_ip() -> str:
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    s.connect(("8.8.8.8", 80))
    ip = s.getsockname()[0]
    s.close()
    return ip


def main():
    ip = lan_ip()
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    name = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "MIC DROP Local")])
    san = x509.SubjectAlternativeName([
        x509.DNSName("localhost"),
        x509.IPAddress(ipaddress.ip_address("127.0.0.1")),
        x509.IPAddress(ipaddress.ip_address(ip)),
    ])
    now = datetime.datetime.utcnow()
    cert = (
        x509.CertificateBuilder()
        .subject_name(name).issuer_name(name)
        .public_key(key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(now - datetime.timedelta(days=1))
        .not_valid_after(now + datetime.timedelta(days=825))
        .add_extension(san, critical=False)
        .add_extension(x509.BasicConstraints(ca=True, path_length=None), critical=True)
        .sign(key, hashes.SHA256())
    )
    out = os.path.join(os.path.dirname(__file__), "certs")
    os.makedirs(out, exist_ok=True)
    with open(os.path.join(out, "key.pem"), "wb") as f:
        f.write(key.private_bytes(serialization.Encoding.PEM,
                                  serialization.PrivateFormat.TraditionalOpenSSL,
                                  serialization.NoEncryption()))
    with open(os.path.join(out, "cert.pem"), "wb") as f:
        f.write(cert.public_bytes(serialization.Encoding.PEM))
    with open(os.path.join(out, "cert.der"), "wb") as f:
        f.write(cert.public_bytes(serialization.Encoding.DER))
    print(f"wrote certs for localhost, 127.0.0.1, {ip}")


if __name__ == "__main__":
    main()
