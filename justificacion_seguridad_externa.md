# Informe de Justificacion de Seguridad: Aislamiento Externo de Aktis Tracker

Este informe justifica tecnicamente por que el uso de la aplicacion **Aktis Tracker** en tu ordenador local no expone los datos confidenciales de la empresa a atacantes externos en Internet.

---

## 1. Resumen Ejecutivo
Aktis Tracker es una aplicacion de red interna (intranet) que funciona de manera 100% local. Su arquitectura y el entorno de red de la empresa garantizan que ningun usuario o sistema externo a la organizacion pueda acceder a los datos de compras, pedidos o proyectos.

---

## 2. Fundamentos Tecnicos del Aislamiento

### A. Direccionamiento IP Privado (RFC 1918)
La aplicacion se ejecuta en el PC del usuario, al cual se le asigna una direccion IP local dentro del rango 192.168.x.x (en este caso, 192.168.1.151).
* **Direcciones No Enrutables:** Segun el estandar de redes RFC 1918, este rango de IPs esta reservado para redes privadas.
* **Imposibilidad de Acceso Externo:** Estas IPs no existen en Internet. Si un atacante intenta conectar con tu IP privada desde fuera, los routers globales de Internet descartan la conexion de inmediato.

### B. Cortafuegos Perimetral y NAT (Traduccion de Direcciones de Red)
El router y el cortafuegos de la oficina dividen la red en dos zonas: la Red Interna (LAN) e Internet (WAN).
* **Traduccion NAT:** Para navegar, el router traduce tu IP privada a una publica. Pero esta traduccion solo funciona de dentro hacia fuera.
* **Bloqueo de Conexiones Entrantes:** El router corporativo bloquea por defecto todas las conexiones entrantes. Internet no puede iniciar una conexion hacia el puerto 3000 de tu PC.

### C. Ejecucion 100% Local (Sin dependencias en la nube)
* **Sin Servidores Externos:** Aktis Tracker no sube informacion a servidores externos. Todo el escaneo y almacenamiento de la cache ocurre dentro de la red local.

---

## 3. Matriz de Exposicion de Red

| Origen de la Conexion | ¿Puede acceder a la App? | Justificacion Tecnica |
| :--- | :---: | :--- |
| Tu propio PC (Localhost) | SI | Acceso directo local (127.0.0.1). |
| PC de compañero de oficina (LAN) | SI | Conexion interna permitida por el Firewall de Windows. |
| Compañero con VPN | SI | La VPN es una extension segura de la red interna. |
| Atacante externo en Internet | NO | Bloqueado por el Firewall del router y la IP privada. |

---

## 4. Buenas Practicas de Mantenimiento
Para mantener la seguridad:
1. **No configurar Port Forwarding:** No redirigir puertos en el router hacia tu puerto 3000.
2. **No activar DMZ:** No exponer tu PC como DMZ en el router.

---

## 5. Conclusion
**Dictamen de Seguridad Externa:** La presencia y funcionamiento de Aktis Tracker en tu ordenador no incrementa el riesgo de intrusion ni de fuga de informacion de cara a atacantes externos en Internet.
